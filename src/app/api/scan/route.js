// src/app/api/scan/route.js
// SERVER-SIDE ONLY — API key never reaches the browser.

export const maxDuration = 60; // seconds — overrides Vercel's default 10s function timeout

export async function POST(request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ANTHROPIC_API_KEY not set in environment" }, { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { existingLocations = [] } = body;
  const trimmed = existingLocations.slice(0, 15);
  const existingList = trimmed.length > 0 ? trimmed.join("; ") : "none";

  // Step 1: Fetch recent fire headlines from GDELT (free, no API key, no token cost)
  // Step 1: Fetch headlines from GDELT.
  // Use timespan (known to work) calculated dynamically from the fixed start date.
  // startdatetime/enddatetime caused GDELT to return a query-error plain-text response.
  const startMs = new Date("2026-04-07T00:00:00Z").getTime();
  const daysBack = Math.max(1, Math.ceil((Date.now() - startMs) / 86400000));
  const timespan = `${daysBack}d`;

  async function gdeltFetch(q) {
    const url =
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}` +
      `&mode=artlist&maxrecords=50&format=json&timespan=${timespan}`;
    console.log("[scan] GDELT URL:", url);
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const raw = await res.text();
    console.log("[scan] GDELT raw snippet:", raw.slice(0, 200));
    let data;
    try { data = JSON.parse(raw); } catch { return []; }
    return data.articles ?? [];
  }

  let articleList = [];
  // GDELT requires requests spaced at least 5 seconds apart.
  const batches = [
    '("building fire" OR "warehouse fire" OR "factory fire" OR "plant fire" OR "office fire" OR "fire broke out" OR "caught fire") sourcelang:english',
    '("store fire" OR "hotel fire" OR "restaurant fire" OR "hospital fire" OR "school fire" OR "industrial fire" OR "commercial fire") sourcelang:english',
  ];
  const seen = new Set();
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 5500));
    try {
      const articles = await gdeltFetch(batches[i]);
      for (const a of articles) {
        if (a.url && !seen.has(a.url)) { seen.add(a.url); articleList.push(a); }
      }
    } catch (err) {
      console.log("[scan] GDELT batch failed:", err.message);
    }
  }
  console.log(`[scan] GDELT total unique articles: ${articleList.length}`);

  const articles = articleList
    .map((a) => `${a.title} (${a.seendate?.slice(0, 8) ?? "unknown"})`)
    .join("\n");

  if (!articles) {
    return Response.json({ text: "NO_NEW_FIRES", articleCount: 0 });
  }

  // Step 2: Send only the article titles to Claude for structured extraction.
  // No web_search tool needed — input tokens are now ~1-2K instead of 30-50K.
  const prompt = `You are a fire incident data extractor. Below are recent US news article headlines. Extract every fire that occurred at a commercial or business location.

Headlines:
${articles}

Already tracked locations (exclude these): ${existingList}

For each qualifying fire, output exactly one line:
- City/Location, ST | Date (YYYY-MM-DD) | Facility type | Brief description

Included location types: warehouses, factories, distribution centers, office buildings, corporate campuses, retail stores, shopping centers, restaurants, hotels, hospitals, schools, government buildings, data centers, or any other commercial/business property.
Excluded: purely residential fires (houses, apartment fires with no commercial component).

Rules:
- ONLY include incidents located in the United States — discard anything from the UK, Canada, Australia, or any other country
- State must be a valid 2-letter US state abbreviation (e.g. CA, TX, NY) — not a country code
- If no qualifying fires are found, output exactly: NO_NEW_FIRES
- No other text, preamble, or explanation`;

  const attemptFetch = async (attemptsLeft) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 429 && attemptsLeft > 0) {
      console.log(`Rate limited, waiting 15s... (${attemptsLeft} left)`);
      await new Promise(r => setTimeout(r, 15000));
      return attemptFetch(attemptsLeft - 1);
    }

    if (!res.ok) {
      const errText = await res.text();
      return Response.json({ error: `API error: ${res.status} — ${errText}` }, { status: 502 });
    }

    const data = await res.json();
    console.log("[scan] stop_reason:", data.stop_reason);
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return Response.json({ text, stopReason: data.stop_reason, articleCount: articleList.length });
  };

  try {
    return await attemptFetch(2);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
