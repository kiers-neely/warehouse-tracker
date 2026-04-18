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

  const prompt = `You are a fire incident tracker. Use web search to find recent news reports of fires at any commercial or business location anywhere in the United States from the past 2 weeks. Cast a wide net and run multiple searches.

  Included location types (any of these count):
  - Warehouses, distribution centers, fulfillment centers, storage facilities
  - Manufacturing plants, factories, industrial facilities
  - Office buildings, corporate campuses, business parks
  - Retail stores, shopping centers, strip malls
  - Restaurants, hotels, apartment complexes with commercial use
  - Schools, hospitals, government buildings, data centers
  - Any other building associated with a business or organization

  Already tracked locations (exclude these from your response): ${existingList}

  Return ONLY new fires not already in the list above. For each fire found, output exactly one line in this format:
  - City/Location, ST | Date (YYYY-MM-DD or approx) | Facility type | Brief source/description

  Example:
  - Memphis, TN | 2025-04-10 | Distribution center | Large fire at Amazon warehouse
  - Detroit, MI | 2025-04-09 | Auto parts manufacturer | Fire destroys parts plant
  - Austin, TX | 2025-04-08 | Office building | Fire on third floor of tech company HQ

  Rules:
  - Search for real confirmed fire incidents using web search - do not fabricate any
  - Only US locations; state must be the 2-letter abbreviation
  - List every fire you find across all searches - do not truncate the list
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
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
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
    // Log full content array so we can diagnose parsing issues in Vercel function logs
    console.log("[scan] stop_reason:", data.stop_reason);
    console.log("[scan] content blocks:", JSON.stringify(data.content?.map(b => ({
      type: b.type,
      text: b.type === "text" ? b.text?.slice(0, 300) : undefined,
      name: b.name,
    }))));
    // Concatenate ALL text blocks — the model may emit a preamble before tool_use,
    // then the actual fire list in a second text block after the search results.
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
