// src/app/api/scan/route.js
// SERVER-SIDE ONLY — API key never reaches the browser.

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
  let articles = "";
  try {
    const query = encodeURIComponent(
      'fire (warehouse OR factory OR "office building" OR "commercial building" OR ' +
      '"distribution center" OR "manufacturing plant" OR "shopping center" OR ' +
      '"retail store" OR "business park" OR "industrial park" OR hotel OR restaurant OR hospital OR school) ' +
      'sourcelang:english sourcecountry:US'
    );
    const startDate = "20260407000000";
    const endDate = new Date().toISOString().slice(0, 10).replace(/-/g, "") + "235959";
    const gdeltUrl =
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}` +
      `&mode=artlist&maxrecords=75&format=json` +
      `&startdatetime=${startDate}&enddatetime=${endDate}`;

    const newsRes = await fetch(gdeltUrl, { signal: AbortSignal.timeout(12000) });
    if (newsRes.ok) {
      const newsData = await newsRes.json();
      articles = (newsData.articles ?? [])
        .map((a) => `${a.title} (${a.seendate?.slice(0, 8) ?? "unknown"})`)
        .join("\n");
      console.log(`[scan] GDELT returned ${newsData.articles?.length ?? 0} articles`);
    } else {
      console.log("[scan] GDELT responded with status", newsRes.status);
    }
  } catch (err) {
    console.log("[scan] GDELT fetch failed:", err.message);
  }

  if (!articles) {
    return Response.json({ text: "NO_NEW_FIRES" });
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
- Only US locations; state must be the 2-letter abbreviation
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
    return Response.json({ text, stopReason: data.stop_reason });
  };

  try {
    return await attemptFetch(2);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
