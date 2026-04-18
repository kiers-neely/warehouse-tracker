// src/app/api/scan/route.js
// SERVER-SIDE ONLY — API key never reaches the browser.

export const maxDuration = 60;

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

  // Step 1: Fetch headlines from Google News RSS — no API key, no rate limits.
  // Switched from GDELT which enforces a strict 1-request-per-5s limit that
  // proved unreliable across Vercel's serverless instances.
  const CUTOFF_DATE = new Date("2026-04-07T00:00:00Z");

  function parseRSS(xml) {
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) ?? [])[1]?.trim();
      const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) ?? [])[1]?.trim();
      if (title && !title.toLowerCase().includes("google news")) {
        // Convert pubDate to YYYY-MM-DD
        const d = pubDate ? new Date(pubDate) : null;
        if (!d || isNaN(d) || d < CUTOFF_DATE) continue;
        const dateStr = d.toISOString().slice(0, 10);
        items.push(`${title} (${dateStr})`);
      }
    }
    return items;
  }

  const rssQuery = encodeURIComponent(
    'warehouse fire OR factory fire OR "office building fire" OR "industrial fire" OR ' +
    '"commercial building fire" OR "store fire" OR "distribution center fire" OR "manufacturing facility fire"'
  );
  const rssUrl = `https://news.google.com/rss/search?q=${rssQuery}&hl=en-US&gl=US&ceid=US:en`;
  console.log("[scan] RSS URL:", rssUrl);

  let articleLines = [];
  try {
    const res = await fetch(rssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; fire-tracker/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    const xml = await res.text();
    console.log("[scan] RSS snippet:", xml.slice(0, 200));
    articleLines = parseRSS(xml);
  } catch (err) {
    console.log("[scan] RSS fetch failed:", err.message);
  }
  console.log(`[scan] RSS articles parsed: ${articleLines.length}`);

  const articles = articleLines.join("\n");

  if (!articles) {
    return Response.json({ text: "NO_NEW_FIRES", articleCount: 0 });
  }

  const prompt = `You are a fire incident data extractor. Below are recent news article headlines. Extract every fire that occurred at a for-profit commercial or business location in the United States.

Headlines:
${articles}

Already tracked locations (exclude these): ${existingList}

For each qualifying fire, output exactly one line:
- City/Location, ST | Date (YYYY-MM-DD) | Facility type | Brief description

Included location types: warehouses, factories, distribution centers, manufacturing plants, office buildings, corporate campuses, retail stores, shopping centers, restaurants, hotels, data centers, or any other for-profit business property.
Excluded: hospitals, schools, universities, government buildings, churches, non-profit organizations, and purely residential fires.

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
    return Response.json({ text, stopReason: data.stop_reason, articleCount: articleLines.length });
  };

  try {
    return await attemptFetch(2);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
