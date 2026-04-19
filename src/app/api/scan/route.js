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
  const CUTOFF_DATE = new Date("2026-04-06T00:00:00Z");

  function parseRSS(xml) {
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(xml)) !== null) {
      const block = m[1];
      const title = (block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) ?? [])[1]?.trim();
      const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) ?? [])[1]?.trim();
      const link = (block.match(/<link>([^<]+)<\/link>/) ?? [])[1]?.trim()
                || (block.match(/<guid[^>]*>([^<]+)<\/guid>/) ?? [])[1]?.trim()
                || "";
      if (title && !title.toLowerCase().includes("google news")) {
        // Convert pubDate to YYYY-MM-DD
        const d = pubDate ? new Date(pubDate) : null;
        if (!d || isNaN(d) || d < CUTOFF_DATE) continue;
        const dateStr = d.toISOString().slice(0, 10);
        items.push({ text: `${title} (${dateStr})`, url: link });
      }
    }
    return items;
  }

  // Three complementary queries run in parallel — each RSS feed caps at ~100 results,
  // so parallel fetches with different terms give us a much wider net.
  const RSS_QUERIES = [
    '(warehouse OR factory OR manufacturing OR industrial OR distribution OR "fulfillment center" OR production) fire after:2026-04-06',
    '(employee OR arson OR investigating OR facility OR plant OR campus OR logistics OR massive OR inventory) fire after:2026-04-06',
  ];

  const fetchRSS = async (query) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; fire-tracker/1.0)" },
      signal: AbortSignal.timeout(15000),
    });
    return res.text();
  };

  let articleEntries = []; // [{text, url}]
  try {
    const results = await Promise.allSettled(RSS_QUERIES.map(fetchRSS));
    const seen = new Set();
    for (const result of results) {
      if (result.status !== "fulfilled") {
        console.log("[scan] RSS fetch failed:", result.reason?.message);
        continue;
      }
      const parsed = parseRSS(result.value);
      for (const { text, url } of parsed) {
        // Deduplicate by normalized title (strip date suffix for comparison)
        const key = text.replace(/\s*\(\d{4}-\d{2}-\d{2}\)$/, "").toLowerCase().replace(/\s+/g, " ").trim();
        if (!seen.has(key)) {
          seen.add(key);
          articleEntries.push({ text, url });
        }
      }
    }
    console.log("[scan] RSS snippet:", results[0].value?.slice(0, 200));
  } catch (err) {
    console.log("[scan] RSS fetch failed:", err.message);
  }
  console.log(`[scan] RSS articles parsed: ${articleEntries.length}`);

  // Number articles and build a URL lookup map so Claude can cite sources by index.
  const urlMap = {};
  const numberedArticles = articleEntries.map(({ text, url }, i) => {
    urlMap[i + 1] = url;
    return `[${i + 1}] ${text}`;
  });
  const articles = numberedArticles.join("\n");

  if (!articles) {
    return Response.json({ text: "NO_NEW_FIRES", articleCount: 0 });
  }

  const prompt = `You are a fire incident data extractor. Below are recent news article headlines, each prefixed with a number in brackets. Extract every fire that occurred at a commercial building or industrial facility in the United States where corporate property or inventory was at risk.

Headlines:
${articles}

Already tracked locations (exclude these): ${existingList}

For each qualifying fire, output exactly one line:
- City/Location, ST | Date (YYYY-MM-DD) | Facility type | Brief description [N]

where [N] is replaced with the bracket number of the headline that best supports this incident (e.g. [3]).

Included facility types: warehouses, factories, distribution centers, fulfillment centers, logistics centers, manufacturing plants, industrial facilities, storage facilities, corporate campuses, office buildings, and data centers.
Excluded: small restaurants, cafes, bars, hospitals, schools, universities, non-profit organizations, and residential fires.

Rules:
- ONLY include incidents located in the United States — discard anything from the UK, Canada, Australia, or any other country
- State must be a valid 2-letter US state abbreviation (e.g. CA, TX, NY) — not a country code
- Do NOT output excluded incidents in any form — simply omit them entirely
- If no qualifying fires are found, output exactly: NO_NEW_FIRES
- No other text, preamble, explanation, or annotations`;

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
        max_tokens: 4096,
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
    const rawText = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    // Resolve article citation numbers [N] → URLs and append as a 6th pipe field.
    const text = rawText.split("\n").map((line) => {
      const numMatch = line.match(/\[(\d+)\]\s*$/);
      if (numMatch) {
        const url = urlMap[parseInt(numMatch[1])] || "";
        const cleanLine = line.replace(/\s*\[\d+\]\s*$/, "");
        return url ? `${cleanLine} | ${url}` : cleanLine;
      }
      return line;
    }).join("\n");

    return Response.json({ text, stopReason: data.stop_reason, articleCount: articleEntries.length });
  };

  try {
    return await attemptFetch(2);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
