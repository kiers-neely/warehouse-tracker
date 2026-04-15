// src/app/api/scan/route.js
// SERVER-SIDE ONLY — API key never reaches the browser.

const CACHE_TTL = 1000 * 60 * 5; // 5 minutes
const GDELT_CACHE = globalThis.__fireTrackerGdeltCache ??= {
  data: null,
  at: 0,
  ongoingFetch: null,
};

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

  // --- Step 1: Query GDELT ---
  const query = `(\"warehouse\" OR \"factory\" OR \"distribution\" OR \"manufacturing\" OR \"industrial fire\" OR \"arson\"\ AND \"fire\") sourcecountry:US sourcelang:english`;

  const gdeltUrl = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  gdeltUrl.searchParams.set("query", query);
  gdeltUrl.searchParams.set("mode", "artlist");
  gdeltUrl.searchParams.set("maxrecords", "50");
  gdeltUrl.searchParams.set("startdatetime", "20260407000000");
  gdeltUrl.searchParams.set("sort", "datedesc");
  gdeltUrl.searchParams.set("format", "json");

  const fetchGdelt = async (attemptsLeft, delayMs = 10000) => {
    const res = await fetch(gdeltUrl.toString(), {
      headers: { "User-Agent": "FireTracker/1.0" },
      next: { revalidate: 300 },
    });

    if (res.status === 429 && attemptsLeft > 0) {
      console.log(`GDELT rate limited, waiting ${delayMs / 1000}s... (${attemptsLeft} attempts left)`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return fetchGdelt(attemptsLeft - 1, delayMs + 10000);
    }

    return res;
  };

  const fetchGdeltWithCache = async () => {
    const now = Date.now();
    if (GDELT_CACHE.data && now - GDELT_CACHE.at < CACHE_TTL) {
      console.log("Using cached GDELT response");
      return GDELT_CACHE.data;
    }

    if (GDELT_CACHE.ongoingFetch) {
      console.log("Awaiting ongoing GDELT request");
      return GDELT_CACHE.ongoingFetch;
    }

    GDELT_CACHE.ongoingFetch = (async () => {
      try {
        const res = await fetchGdelt(3);
        if (!res.ok) {
          const text = await res.text();
          console.log("GDELT error:", res.status, text.slice(0, 200));
          if (GDELT_CACHE.data) {
            console.log("Using stale cached GDELT response after failed request");
            return GDELT_CACHE.data;
          }
          return null;
        }

        const data = await res.json();
        if (data?.articles?.length) {
          GDELT_CACHE.data = data;
          GDELT_CACHE.at = Date.now();
          console.log("GDELT articles found:", data.articles.length);
          return data;
        }

        if (GDELT_CACHE.data) {
          console.log("Using stale cached GDELT response because new response had no articles");
          return GDELT_CACHE.data;
        }

        return data;
      } catch (e) {
        console.log("GDELT fetch error:", e.message);
        if (GDELT_CACHE.data) {
          console.log("Using stale cached GDELT response after fetch exception");
          return GDELT_CACHE.data;
        }
        return null;
      } finally {
        GDELT_CACHE.ongoingFetch = null;
      }
    })();

    return GDELT_CACHE.ongoingFetch;
  };

  let articles = [];
  try {
    const data = await fetchGdeltWithCache();
    if (data?.articles?.length) {
      articles = data.articles;
    }
  } catch (e) {
    console.log("GDELT fetch error:", e.message);
  }

  if (articles.length === 0) {
    return Response.json({ text: "NO_NEW_FIRES" });
  }

  // --- Step 2: Claude Haiku parses/formats the headlines ---
  const articleList = articles
    .slice(0, 40)
    .map((a, i) => {
      const date = a.seendate
        ? a.seendate.substring(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3")
        : "unknown";
      return `${i + 1}. ${a.title || "No title"} (${a.domain || ""}, ${date})`;
    })
    .join("\n");

  const prompt = `You are reviewing news headlines about fires at US industrial facilities.

Already tracked (skip these): ${existingList}

Headlines:
${articleList}

From the headlines above, extract all confirmed fires in the US. Skip duplicate buildings.

If none qualify: NO_NEW_FIRES
No other text.`;

  const attemptAnthropic = async (attemptsLeft) => {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (anthropicRes.status === 429 && attemptsLeft > 0) {
      await new Promise(r => setTimeout(r, 10000));
      return attemptAnthropic(attemptsLeft - 1);
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return Response.json({ error: `Anthropic API error: ${anthropicRes.status} — ${errText}` }, { status: 502 });
    }

    const data = await anthropicRes.json();
    const textBlock = data.content?.find((b) => b.type === "text");
    const text = textBlock?.text?.trim() ?? "";
    const incidentLines = text === "NO_NEW_FIRES" ? [] : text.split("\n").filter((l) => l.trim());
    return Response.json({ text, articleCount: articles.length, incidentCount: incidentLines.length });
  };

  try {
    return await attemptAnthropic(2);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}