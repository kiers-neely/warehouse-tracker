// src/app/api/scan/route.js
// SERVER-SIDE ONLY — queries GDELT directly instead of relying on an AI web search.

const FIRE_QUERY = `("warehouse fire" OR "factory fire" OR "distribution center fire" OR "manufacturing plant fire" OR "industrial fire" OR "logistics center fire") sourcecountry:US sourcelang:english`;
const MAX_RECORDS = 50;
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

let cachedData = null;
let cachedAt = 0;
let pendingFetch = null;

function formatDate(seendate) {
  if (!seendate || seendate.length < 8) return "unknown";
  return `${seendate.substring(0, 4)}-${seendate.substring(4, 6)}-${seendate.substring(6, 8)}`;
}

function inferFacilityType(title) {
  const normalized = title.toLowerCase();
  if (normalized.includes("warehouse")) return "Warehouse";
  if (normalized.includes("distribution center")) return "Distribution center";
  if (normalized.includes("manufacturing plant")) return "Manufacturing plant";
  if (normalized.includes("factory")) return "Factory";
  if (normalized.includes("logistics")) return "Logistics center";
  if (normalized.includes("industrial")) return "Industrial facility";
  return "Industrial facility";
}

function extractCityState(title) {
  const fullMatch = title.match(/([A-Z][a-zA-Z .'-]+),\s*([A-Z]{2})/);
  if (fullMatch) {
    return { city: fullMatch[1].trim(), state: fullMatch[2] };
  }

  const cityStateMatch = title.match(/(?:in|at|near)\s+([A-Za-z .'-]+),\s*([A-Z]{2})/i);
  if (cityStateMatch) {
    return { city: cityStateMatch[1].trim(), state: cityStateMatch[2] };
  }

  const stateMatch = title.match(/\b([A-Z]{2})\b/);
  if (stateMatch) {
    return { city: "Unknown", state: stateMatch[1] };
  }

  return { city: "Unknown", state: "US" };
}

function isHeadlineRelevant(title) {
  const normalized = title.toLowerCase();
  return (
    normalized.includes("fire") &&
    (normalized.includes("warehouse") ||
      normalized.includes("factory") ||
      normalized.includes("distribution center") ||
      normalized.includes("manufacturing plant") ||
      normalized.includes("industrial") ||
      normalized.includes("logistics"))
  );
}

function normalizeTrackedKey(line) {
  return line.trim().toLowerCase();
}

function parseHeadlineToIncident(article) {
  const title = (article.title || "Unknown fire incident").replace(/\s+/g, " ").trim();
  if (!isHeadlineRelevant(title)) return null;

  const { city, state } = extractCityState(title);
  const date = formatDate(article.seendate || article.documentdate || "");
  const facility = inferFacilityType(title);
  const description = title;

  return `${city}, ${state} | ${date} | ${facility} | ${description}`;
}

async function fetchGdeltData(attemptsLeft = 3, delayMs = 5000) {
  const now = Date.now();
  if (cachedData && now - cachedAt < CACHE_TTL) {
    return cachedData;
  }

  if (pendingFetch) {
    return pendingFetch;
  }

  const gdeltUrl = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  gdeltUrl.searchParams.set("query", FIRE_QUERY);
  gdeltUrl.searchParams.set("mode", "artlist");
  gdeltUrl.searchParams.set("maxrecords", String(MAX_RECORDS));
  gdeltUrl.searchParams.set("sort", "datedesc");
  gdeltUrl.searchParams.set("format", "json");

  pendingFetch = (async () => {
    try {
      const res = await fetch(gdeltUrl.toString(), {
        headers: { "User-Agent": "FireTracker/1.0" },
      });

      if (res.status === 429 && attemptsLeft > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return fetchGdeltData(attemptsLeft - 1, delayMs * 2);
      }

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GDELT fetch failed: ${res.status} ${text}`);
      }

      const data = await res.json();
      cachedData = data;
      cachedAt = Date.now();
      return data;
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { existingLocations = [] } = body;
  const existingKeys = new Set(existingLocations.map(normalizeTrackedKey).slice(0, 15));

  let data;
  try {
    data = await fetchGdeltData();
  } catch (error) {
    console.log("GDELT error:", error.message);
    return Response.json({ error: "Unable to query news at this time." }, { status: 502 });
  }

  const articles = Array.isArray(data?.articles) ? data.articles : [];
  const incidents = [];
  const seen = new Set();

  for (const article of articles) {
    const incident = parseHeadlineToIncident(article);
    if (!incident) continue;

    const normalized = normalizeTrackedKey(incident);
    if (existingKeys.has(normalized) || seen.has(normalized)) continue;

    seen.add(normalized);
    incidents.push(incident);
  }

  if (incidents.length === 0) {
    return Response.json({ text: "NO_NEW_FIRES", articleCount: articles.length, incidentCount: 0 });
  }

  return Response.json({ text: incidents.join("\n"), articleCount: articles.length, incidentCount: incidents.length });
}
