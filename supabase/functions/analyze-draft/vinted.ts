// Ported from the vinted-mcp-server npm package's HttpAuth/VintedAPIClient
// (plain fetch + cookie/CSRF bootstrap, no headless browser). See README.md
// in this project for why this might get blocked from a datacenter IP.

const DOMAIN: Record<string, string> = {
  dk: "vinted.dk",
  fr: "vinted.fr",
  de: "vinted.de",
  uk: "vinted.co.uk",
  it: "vinted.it",
  es: "vinted.es",
  nl: "vinted.nl",
  pl: "vinted.pl",
  se: "vinted.se",
};

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export interface VintedSession {
  cookies: Record<string, string>;
  csrfToken: string;
  accessToken: string;
  baseUrl: string;
}

export interface VintedItem {
  id: number;
  title: string;
  price: string;
  currency: string;
  url: string;
}

function baseUrlFor(country: string): string {
  const domain = DOMAIN[country] || DOMAIN.fr;
  return `https://www.${domain}`;
}

function parseCookies(setCookies: string[]): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const cookieStr of setCookies) {
    const [nameValue] = cookieStr.split(";");
    if (!nameValue) continue;
    const eqIdx = nameValue.indexOf("=");
    if (eqIdx > 0) {
      cookies[nameValue.slice(0, eqIdx).trim()] = nameValue.slice(eqIdx + 1).trim();
    }
  }
  return cookies;
}

export async function createSession(country: string): Promise<VintedSession> {
  const baseUrl = baseUrlFor(country);

  const homepageRes = await fetch(baseUrl, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en;q=0.9",
    },
    redirect: "follow",
  });

  const setCookies = (homepageRes.headers as unknown as { getSetCookie?: () => string[] })
    .getSetCookie?.() ?? [];
  const cookies = parseCookies(setCookies);
  const html = await homepageRes.text();

  let csrfToken = cookies["csrf_token"] || cookies["_csrf_token"] || "";
  if (!csrfToken) {
    const m = html.match(/name="csrf-token"\s+content="([^"]+)"/);
    if (m) csrfToken = m[1];
  }

  let accessToken = "";
  try {
    const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ");
    const meRes = await fetch(`${baseUrl}/api/v2/users/current`, {
      headers: { "Accept": "application/json", "X-CSRF-Token": csrfToken, "Cookie": cookieHeader },
    });
    if (meRes.ok) {
      const meJson = await meRes.json();
      accessToken = meJson?.access_token || "";
    }
  } catch {
    // anonymous is fine for search
  }
  if (!accessToken) accessToken = cookies["access_token"] || "";

  return { cookies, csrfToken, accessToken, baseUrl };
}

export function buildSearchUrl(baseUrl: string, query: string, perPage = 8): string {
  const url = new URL(`${baseUrl}/api/v2/catalog/items`);
  url.searchParams.set("search_text", query);
  url.searchParams.set("order", "relevance");
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", String(perPage));
  return url.toString();
}

export async function searchItems(
  session: VintedSession,
  query: string,
  perPage = 8,
): Promise<VintedItem[]> {
  const url = buildSearchUrl(session.baseUrl, query, perPage);
  const cookieHeader = Object.entries(session.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
  const headers: Record<string, string> = {
    "User-Agent": UA,
    "Accept": "application/json, text/plain, */*",
    "Cookie": cookieHeader,
    "X-CSRF-Token": session.csrfToken,
  };
  if (session.accessToken) headers["Authorization"] = `Bearer ${session.accessToken}`;

  const res = await fetch(url, { headers, redirect: "follow" });
  if (!res.ok) {
    const body = await res.text();
    const blocked = body.includes("cf-challenge") || body.includes("cloudflare") || res.status === 403;
    throw new Error(`vinted_${blocked ? "blocked" : "error"}_${res.status}`);
  }
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((it: Record<string, unknown>) => ({
    id: Number(it.id),
    title: String(it.title ?? ""),
    price: String((it.price as Record<string, unknown>)?.amount ?? it.price ?? ""),
    currency: String((it.price as Record<string, unknown>)?.currency_code ?? ""),
    url: String(it.url ?? ""),
  }));
}

// Tries `primaryCountry` first, falls back to `fallbackCountry` on any
// failure (including a suspected IP block) so one blocked market doesn't
// take down the whole draft.
export async function searchWithFallback(
  query: string,
  primaryCountry: string,
  fallbackCountry: string,
  perPage = 8,
  triesPerCountry = 2,
): Promise<{ items: VintedItem[]; country: string; blocked: boolean }> {
  const attempts: Array<{ country: string; delayMs: number }> = [];
  for (const country of [primaryCountry, fallbackCountry]) {
    for (let i = 0; i < triesPerCountry; i++) {
      attempts.push({ country, delayMs: i === 0 ? 0 : 1200 });
    }
  }

  let lastBlocked = false;
  for (const attempt of attempts) {
    if (attempt.delayMs) await new Promise((r) => setTimeout(r, attempt.delayMs));
    try {
      const session = await createSession(attempt.country);
      const items = await searchItems(session, query, perPage);
      if (items.length) return { items, country: attempt.country, blocked: false };
    } catch (err) {
      lastBlocked = err instanceof Error && err.message.includes("blocked");
    }
  }
  return { items: [], country: fallbackCountry, blocked: lastBlocked };
}
