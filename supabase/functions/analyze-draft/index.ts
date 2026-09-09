// Triggered by a Postgres webhook (see schema.sql / update_webhook.sql)
// whenever a new "afventer" draft is inserted. Analyzes the photo with
// Claude, grounds a price estimate in real Vinted listings, and writes
// the finished draft back to the row.

import { createClient } from "npm:@supabase/supabase-js@2";
import { searchWithFallback } from "./vinted.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MODEL = "claude-haiku-4-5-20251001";

async function callClaude(system: string, userContent: unknown[]): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropic_error_${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? "";
  return text;
}

function extractJson(text: string): Record<string, unknown> {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("no_json_in_response");
  return JSON.parse(match[0]);
}

Deno.serve(async (req: Request) => {
  if (req.headers.get("x-webhook-secret") !== WEBHOOK_SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  let id: string, imageUrl: string;
  try {
    const body = await req.json();
    id = body.id;
    imageUrl = body.image_url;
    if (!id || !imageUrl) throw new Error("missing id or image_url");
  } catch (e) {
    return new Response(`bad_request: ${e}`, { status: 400 });
  }

  try {
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`image_fetch_${imgRes.status}`);
    const imgBuf = await imgRes.arrayBuffer();
    const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuf)));
    const mediaType = imgRes.headers.get("content-type") || "image/jpeg";

    // 1. Vision: identify the product from the photo.
    const visionText = await callClaude(
      "Du analyserer et foto af en genbrugsting, der skal saelges paa Vinted. " +
        "Svar KUN med et JSON-objekt, ingen forklaring udenom: " +
        '{"productType": "...", "brand": "... eller null", "color": "...", ' +
        '"condition": "ny/brugt/slidt", "category": "...", "searchQuery": "korte soegeord til at finde lignende varer"}',
      [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imgB64 } },
        { type: "text", text: "Analysér billedet og svar med JSON som beskrevet." },
      ],
    );
    const vision = extractJson(visionText);
    const searchQuery = String(vision.searchQuery || vision.productType || "genbrug");

    // 2. Ground pricing in real Vinted listings (dk first, fr as fallback).
    const { items, country, blocked } = await searchWithFallback(searchQuery, "dk", "fr");
    const comparables = items.slice(0, 6).map((it) => `${it.title} — ${it.price} ${it.currency}`).join("\n");

    // 3. Write the final Danish ad draft, grounded in whatever comparables we found.
    const draftPrompt = blocked || items.length === 0
      ? `Vinted-opslag kunne ikke hentes (${blocked ? "sandsynligvis blokeret" : "ingen resultater"}) for "${searchQuery}" i ${country}. ` +
        "Skriv prisen som dit eget bedste skoen og sig det tydeligt i price_note."
      : `Her er ${items.length} lignende annoncer fundet paa Vinted (${country}):\n${comparables}\n` +
        "Basér prisforslaget paa disse.";

    const draftText = await callClaude(
      "Du skriver et annonce-udkast paa DANSK til Vinted, ud fra en produktanalyse og evt. sammenlignelige priser. " +
        "Svar KUN med et JSON-objekt: " +
        '{"title": "...", "description": "...", "category": "...", "condition": "...", "price": "fx 89 kr", "priceNote": "kort begrundelse"}',
      [
        {
          type: "text",
          text: `Produktanalyse: ${JSON.stringify(vision)}\n\n${draftPrompt}`,
        },
      ],
    );
    const draft = extractJson(draftText);

    const { error } = await supabase
      .from("drafts")
      .update({
        status: "ny",
        title: draft.title,
        description: draft.description,
        category: draft.category,
        condition: draft.condition,
        price: draft.price,
        price_note: draft.priceNote,
      })
      .eq("id", id);

    if (error) throw new Error(`db_update_failed: ${error.message}`);

    return new Response(JSON.stringify({ ok: true, blocked }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("analyze-draft failed", err);
    // Leave status as 'afventer' but note the failure so the UI/user isn't left guessing forever.
    await supabase.from("drafts").update({
      price_note: `Analyse mislykkedes: ${err instanceof Error ? err.message : String(err)}`,
    }).eq("id", id);
    return new Response(`error: ${err}`, { status: 500 });
  }
});
