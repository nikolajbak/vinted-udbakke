// Called from an iOS Shortcut ("Get contents of URL"). Returns a small
// JavaScript snippet (as plain text) that the Shortcut then runs against
// the Vinted "Sælg en artikel" page via "Run JavaScript on Web Page" —
// it fills title/description/price, and deliberately does NOT touch the
// photo picker, the category picker, or the final Upload/publish button.
// Those three stay manual: photo attachment can't be scripted by any web
// page for security reasons, category is a picker (too fragile to script
// reliably), and publishing is a decision the seller always makes themself.

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHORTCUT_KEY = Deno.env.get("SHORTCUT_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function buildScript(title: string, description: string, price: string): string {
  // JSON.stringify doubles as a safe JS-string-literal encoder here.
  const t = JSON.stringify(title);
  const d = JSON.stringify(description);
  // Vinted's price field wants a plain number; strip everything but digits/comma/dot.
  const priceNumber = price.replace(/[^\d.,]/g, "").replace(",", ".");
  const p = JSON.stringify(priceNumber);

  return `(function(){
  function setNativeValue(el, value){
    if(!el) return false;
    var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  var okTitle = setNativeValue(document.querySelector('#title'), ${t});
  var okDesc = setNativeValue(document.querySelector('#description'), ${d});
  var okPrice = setNativeValue(document.querySelector('#price'), ${p});
  if(okTitle && okDesc && okPrice){
    completion('Udfyldt — vælg kategori, tilføj billede og tjek før du uploader.');
  } else {
    completion('Kunne ikke finde alle felter — er du på "Sælg en artikel"-siden?');
  }
})();`;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== SHORTCUT_KEY) {
    return new Response("unauthorized", { status: 401 });
  }

  const { data, error } = await supabase
    .from("drafts")
    .select("title, description, price")
    .eq("status", "ny")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return new Response(`db_error: ${error.message}`, { status: 500 });
  }
  if (!data) {
    return new Response("completion('Ingen klar udkast lige nu.');", {
      headers: { "content-type": "application/javascript" },
    });
  }

  const script = buildScript(data.title || "", data.description || "", data.price || "");
  return new Response(script, {
    headers: { "content-type": "application/javascript" },
  });
});
