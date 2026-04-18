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

  const prompt = `You are a fire incident tracker. Use web search to find recent news reports of warehouse fires, manufacturing plant fires, distribution center fires, commercial building fires, or industrial facility fires anywhere in the United States from the past 2 weeks. Search thoroughly — there are typically many such incidents each week across the country.

  Already tracked locations (exclude these from your response): ${existingList}

  Return ONLY new fires not already in the list above. For each fire found, output exactly one line in this format:
  - City/Location, ST | Date (YYYY-MM-DD or approx) | Facility type | Brief source/description

  Example:
  - Memphis, TN | 2025-04-10 | Distribution center | Large fire at Amazon warehouse
  - Detroit, MI | 2025-04-09 | Auto parts manufacturer | Fire destroys parts plant
  - Houston, TX | 2025-04-08 | Commercial building | Fire damages strip mall warehouse

  Rules:
  - Search for real confirmed fire incidents using web search — do not fabricate any
  - Include warehouse fires, manufacturing plants, distribution centers, commercial buildings, storage facilities
  - Only US locations
  - State must be the 2-letter abbreviation
  - List every fire you find, do not truncate the list
  - If no new fires found after searching, output exactly: NO_NEW_FIRES
  - Do not include any other text, preamble, or explanation`;

  const attemptFetch = async (attemptsLeft) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
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
    const textBlock = data.content?.find((b) => b.type === "text");
    const text = textBlock?.text?.trim() ?? "";
    return Response.json({ text });
  };

  try {
    return await attemptFetch(2);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}