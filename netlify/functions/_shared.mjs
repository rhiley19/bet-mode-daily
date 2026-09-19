const SPORT_CONFIG = {
  MLB: {
    oddsKey: "baseball_mlb",
    label: "MLB",
    officialDomains: ["mlb.com", "baseballsavant.mlb.com", "baseball-reference.com", "fangraphs.com"],
    propMarkets: ["pitcher_strikeouts", "batter_hits", "batter_total_bases", "batter_hits_runs_rbis"]
  },
  NFL: {
    oddsKey: "americanfootball_nfl",
    label: "NFL",
    officialDomains: ["nfl.com", "pro-football-reference.com"],
    propMarkets: ["player_pass_yds", "player_rush_yds", "player_reception_yds", "player_receptions", "player_pass_tds"]
  },
  NHL: {
    oddsKey: "icehockey_nhl",
    label: "NHL",
    officialDomains: ["nhl.com", "naturalstattrick.com", "hockey-reference.com"],
    propMarkets: ["player_shots_on_goal", "player_points", "player_assists", "player_goal_scorer_anytime"]
  },
  NBA: {
    oddsKey: "basketball_nba",
    label: "NBA",
    officialDomains: ["nba.com", "basketball-reference.com"],
    propMarkets: ["player_points", "player_rebounds", "player_assists", "player_threes", "player_points_rebounds_assists"]
  },
  UCL: {
    oddsKey: "soccer_uefa_champs_league",
    label: "Champions League",
    officialDomains: ["uefa.com", "fbref.com", "statbunker.com"],
    propMarkets: []
  },
  EPL: {
    oddsKey: "soccer_epl",
    label: "Premier League",
    officialDomains: ["premierleague.com", "fbref.com", "statbunker.com"],
    propMarkets: ["player_goal_scorer_anytime", "player_shots_on_target", "player_shots", "player_assists"]
  },
  LALIGA: {
    oddsKey: "soccer_spain_la_liga",
    label: "La Liga",
    officialDomains: ["laliga.com", "fbref.com", "statbunker.com"],
    propMarkets: ["player_goal_scorer_anytime", "player_shots_on_target", "player_shots", "player_assists"]
  }
};

const BASE_DOMAINS = [
  "sportsnet.ca",
  "tsn.ca",
  "espn.com",
  "cbssports.com",
  "apnews.com",
  "reuters.com",
  "weather.com"
];

const MARKET_LABELS = {
  h2h: "Moneyline",
  spreads: "Spread",
  totals: "Game total",
  pitcher_strikeouts: "Pitcher strikeouts",
  batter_hits: "Batter hits",
  batter_total_bases: "Total bases",
  batter_hits_runs_rbis: "Hits + runs + RBIs",
  player_pass_yds: "Passing yards",
  player_rush_yds: "Rushing yards",
  player_reception_yds: "Receiving yards",
  player_receptions: "Receptions",
  player_pass_tds: "Passing TDs",
  player_shots_on_goal: "Shots on goal",
  player_points: "Points",
  player_assists: "Assists",
  player_goal_scorer_anytime: "Anytime goal scorer",
  player_rebounds: "Rebounds",
  player_threes: "Made threes",
  player_points_rebounds_assists: "Points + rebounds + assists",
  player_shots_on_target: "Shots on target",
  player_shots: "Shots"
};

export function getSportConfig(sportRaw) {
  const key = String(sportRaw || "MLB").toUpperCase();
  return { key, ...(SPORT_CONFIG[key] || SPORT_CONFIG.MLB) };
}

export function torontoDate(iso = new Date().toISOString()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(iso));
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function americanToImplied(odds) {
  const n = Number(odds);
  if (!Number.isFinite(n) || n === 0) return null;
  if (n < 0) return (-n) / ((-n) + 100);
  return 100 / (n + 100);
}

function marketLabel(key) {
  if (MARKET_LABELS[key]) return MARKET_LABELS[key];
  return String(key || "market").replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function isPlayerProp(key) {
  return /^(player_|batter_|pitcher_)/.test(String(key || ""));
}

export function flattenMarkets(events, { propOnly = false } = {}) {
  const preferred = ["fanduel", "pinnacle", "draftkings", "betmgm"];
  const rows = [];

  for (const event of events || []) {
    const books = Array.isArray(event.bookmakers) ? event.bookmakers : [];
    let selected = books.filter((b) => preferred.includes(String(b.key || "").toLowerCase()));
    if (!selected.length) selected = books.slice(0, 2);

    for (const book of selected.slice(0, propOnly ? 1 : 3)) {
      for (const market of book.markets || []) {
        const prop = isPlayerProp(market.key);
        if (propOnly && !prop) continue;
        if (!propOnly && !["h2h", "spreads", "totals"].includes(market.key)) continue;

        for (let i = 0; i < (market.outcomes || []).length; i++) {
          const outcome = market.outcomes[i];
          const participant = outcome.description || null;
          const id = [event.id, book.key, market.key, participant || "team", i].join("|");
          rows.push({
            id,
            eventId: event.id,
            commenceTime: event.commence_time || event.start_time,
            game: `${event.away_team} @ ${event.home_team}`,
            homeTeam: event.home_team,
            awayTeam: event.away_team,
            bookmaker: book.title || book.key,
            bookmakerKey: book.key,
            bookmakerLastUpdate: book.last_update || null,
            market: market.key,
            marketLabel: marketLabel(market.key),
            isPlayerProp: prop,
            participant,
            outcome: outcome.name,
            point: outcome.point ?? null,
            odds: outcome.price
          });
        }
      }
    }
  }
  return rows;
}

function normalizeOddsResponse(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.data)) return payload.data;
  if (payload && payload.id && Array.isArray(payload.bookmakers)) return [payload];
  return [];
}

async function oddsFetch(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Odds provider error ${res.status}: ${txt.slice(0, 220)}`);
  }
  const payload = await res.json();
  return {
    events: normalizeOddsResponse(payload),
    quota: {
      remaining: res.headers.get("x-requests-remaining"),
      used: res.headers.get("x-requests-used"),
      last: res.headers.get("x-requests-last")
    }
  };
}

export async function fetchTodaysMarkets(config, requestedDate, { lowCreditMode = false } = {}) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) throw new Error("ODDS_API_KEY is not configured.");

  const url = new URL(`https://api.the-odds-api.com/v4/sports/${config.oddsKey}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("markets", lowCreditMode ? "h2h" : "h2h,spreads,totals");
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("bookmakers", "fanduel,pinnacle,draftkings,betmgm");
  url.searchParams.set("dateFormat", "iso");

  const featured = await oddsFetch(url);
  const localDate = requestedDate || torontoDate();
  const todays = featured.events.filter((e) => torontoDate(e.commence_time || e.start_time) === localDate);
  const markets = flattenMarkets(todays);
  const warnings = [];

  const propEnabled = String(process.env.ODDS_INCLUDE_PROPS || "false").toLowerCase() === "true";
  const maxPropEvents = Math.min(Math.max(Number(process.env.MAX_PROP_EVENTS || 6), 0), 12);

  if (propEnabled && (config.propMarkets || []).length && todays.length) {
    const propEvents = todays.slice(0, maxPropEvents);
    const propResults = await Promise.allSettled(propEvents.map(async (event) => {
      const propUrl = new URL(`https://api.the-odds-api.com/v4/sports/${config.oddsKey}/events/${event.id}/odds`);
      propUrl.searchParams.set("apiKey", apiKey);
      propUrl.searchParams.set("bookmakers", "fanduel");
      propUrl.searchParams.set("markets", config.propMarkets.join(","));
      propUrl.searchParams.set("oddsFormat", "american");
      propUrl.searchParams.set("dateFormat", "iso");
      return oddsFetch(propUrl);
    }));

    for (const result of propResults) {
      if (result.status === "fulfilled") markets.push(...flattenMarkets(result.value.events, { propOnly: true }));
      else warnings.push(`Player-prop feed skipped one event: ${result.reason?.message || "provider error"}`);
    }
  }

  const updateTimes = markets.map((m) => Date.parse(m.bookmakerLastUpdate)).filter(Number.isFinite);
  const latestMarketUpdate = updateTimes.length ? new Date(Math.max(...updateTimes)).toISOString() : null;

  return {
    markets,
    quota: featured.quota,
    latestMarketUpdate,
    propMode: propEnabled ? "enabled" : "disabled",
    usageMode: lowCreditMode ? "low-credit" : "full",
    warnings
  };
}

export function sourceDomains(config) {
  return Array.from(new Set([...BASE_DOMAINS, ...(config.officialDomains || [])])).slice(0, 30);
}

export function extractOutputText(response) {
  if (typeof response?.output_text === "string") return response.output_text;
  const chunks = [];
  for (const item of response?.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      if (c.type === "output_text" && typeof c.text === "string") chunks.push(c.text);
    }
  }
  return chunks.join("\n");
}

export function extractCitations(response) {
  const seen = new Set();
  const out = [];
  for (const item of response?.output || []) {
    if (item.type !== "message") continue;
    for (const c of item.content || []) {
      for (const a of c.annotations || []) {
        const url = a.url || a.url_citation?.url;
        const title = a.title || a.url_citation?.title || url;
        if (url && !seen.has(url)) {
          seen.add(url);
          out.push({ url, title });
        }
      }
    }
  }
  return out.slice(0, 24);
}

export function parseJsonLoose(text) {
  if (!text) throw new Error("Analysis model returned no text.");
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("Could not parse analysis response as JSON.");
}

async function callResearch({ config, prompt, imageDataUrl = null, researchMode = "quick" }) {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured.");

  const content = [{ type: "input_text", text: prompt }];
  if (imageDataUrl) {
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageDataUrl)) {
      throw new Error("Screenshot must be PNG, JPEG or WebP.");
    }
    if (imageDataUrl.length > 4_500_000) throw new Error("Screenshot is too large after compression.");
    content.push({ type: "input_image", image_url: imageDataUrl, detail: "high" });
  }

  const body = {
    model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
    reasoning: { effort: researchMode === "deep" ? "medium" : "low" },
    tools: [{
      type: "web_search",
      filters: { allowed_domains: sourceDomains(config) },
      search_context_size: researchMode === "deep" ? "medium" : "low"
    }],
    tool_choice: "auto",
    input: [{ role: "user", content }]
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Research engine error ${res.status}: ${txt.slice(0, 300)}`);
  }

  const response = await res.json();
  return {
    analysis: parseJsonLoose(extractOutputText(response)),
    sources: extractCitations(response)
  };
}

export async function runResearch({ config, sport, date, markets, extraContext = "", researchMode = "quick" }) {
  const slimMarkets = markets.slice(0, 280);
  const hasProps = slimMarkets.some((m) => m.isPlayerProp);
  const prompt = `You are the research engine for BET MODE, a disciplined sports-betting dashboard in Ontario, Canada.

Sport: ${sport}
Date in America/Toronto: ${date}
Sportsbook preference: FanDuel Canada. IMPORTANT: supplied prices are reference sportsbook prices and may not match FanDuel Canada. Never claim they are exact Ontario prices. A user-supplied FanDuel screenshot always overrides external prices.

Research the current slate before recommending anything. Check injuries/inactives, confirmed or expected lineups, starting pitchers/QBs/goalies, recent player usage and performance, home/away splits, opponent matchup, batter-vs-pitcher only when the sample is meaningful, rest/travel/schedule spots, weather when relevant, and role/lineup changes. Prefer Sportsnet and TSN for Canadian coverage, official league/team sources for confirmations, and reputable statistical sources. Prefer current information over historical narratives.

Only recommend a market that appears in MARKET_FEED. Never invent odds, lines, stats, injuries or lineups. Distinguish probability from value. A large favourite may be likely but still be a bad bet. Actively reject overpriced favourites, weak statistical support, small samples, injury/lineup uncertainty, excessive vig, volatile props, poor parlay legs and correlation issues.

Player props in feed: ${hasProps ? "YES — evaluate them normally." : "NO — bestPlayerProp must be null rather than invented."}
${extraContext}

MARKET_FEED (each id is authoritative for its listed reference price):
${JSON.stringify(slimMarkets)}

Return ONLY valid JSON in this exact shape:
{
  "summary": "2-4 sentence slate summary emphasizing value vs probability",
  "candidates": [
    {
      "marketId": "exact id from MARKET_FEED",
      "estimatedProbability": 0.61,
      "probabilityRange": [0.58, 0.64],
      "confidence": 7.5,
      "why": "concise evidence-based reason",
      "mainRisk": "main way this loses",
      "flags": ["optional concise warning"]
    }
  ],
  "rankings": {
    "bestBet": "marketId or null",
    "safest": "marketId or null",
    "bestValue": "marketId or null",
    "bestPlayerProp": "marketId or null",
    "bestPlusMoney": "marketId or null",
    "pass": ["game or market and reason"]
  },
  "parlays": {
    "conservative": ["marketId", "marketId"],
    "balanced": ["marketId", "marketId", "marketId"],
    "longShot": []
  },
  "parlayNotes": {
    "conservative": "correlation / risk note",
    "balanced": "correlation / risk note",
    "longShot": "explain pass if empty"
  },
  "topThree": ["marketId", "marketId", "marketId"],
  "warnings": ["price sensitivity, uncertainty, or reason to reassess"]
}

Do not manufacture precision. estimatedProbability may be null if evidence is insufficient. Do not create a long-shot parlay just to fill the field. Prefer PASS to a weak wager.`;

  return callResearch({ config, prompt, researchMode });
}

export async function runBetCheckResearch({ config, sport, date, markets, slipText = "", imageDataUrl = null }) {
  const slimMarkets = markets.slice(0, 240);
  const prompt = `You are BET CHECK for a disciplined Ontario sports bettor.

Sport context: ${sport}
Date in America/Toronto: ${date}
The user may provide pasted slip text, a FanDuel Canada screenshot, or both. If a screenshot is present, read every visible leg and its displayed price carefully. Treat visible FanDuel Canada prices as authoritative for the user's wager. Do not invent unreadable text or odds.

PASTED SLIP TEXT:
${slipText || "(none)"}

CURRENT REFERENCE MARKET FEED:
${JSON.stringify(slimMarkets)}

For each leg: research current injuries, lineups, starters, recent usage/performance and matchup context as relevant. Compare the user's price with the reference feed only when the same market can be matched. Never pretend a reference price is FanDuel Canada. Identify the weakest leg. Explain correlation, contradiction, redundancy and combined risk. Recommend KEEP / REPLACE / REMOVE for every leg. If the screenshot is unclear, say which field is uncertain instead of guessing.

Return ONLY valid JSON in this exact shape:
{
  "summary": "short overall assessment",
  "extractedSlip": [
    {"bet": "exact visible/pasted leg", "odds": "visible odds or unknown"}
  ],
  "legs": [
    {
      "bet": "leg",
      "odds": "price",
      "verdict": "KEEP or REPLACE or REMOVE",
      "confidence": 7,
      "why": "evidence-based assessment",
      "mainRisk": "main risk",
      "priceNote": "price comparison or unable to verify"
    }
  ],
  "weakestLeg": "leg name or none",
  "combinedRisk": "concise combined-ticket risk/correlation explanation",
  "recommendation": "what to keep, replace, remove; do not chase payout",
  "warnings": ["uncertainty or price warning"]
}`;

  return callResearch({ config, prompt, imageDataUrl });
}

export function hydrateAnalysis(analysis, markets) {
  const byId = new Map(markets.map((m) => [m.id, m]));
  const candidateById = new Map();

  const candidates = (analysis.candidates || []).map((c) => {
    const market = byId.get(c.marketId);
    if (!market) return null;
    const implied = americanToImplied(market.odds);
    const estimate = Number.isFinite(Number(c.estimatedProbability)) ? Number(c.estimatedProbability) : null;
    const hydrated = {
      ...market,
      ...c,
      impliedProbability: implied,
      edge: implied != null && estimate != null ? estimate - implied : null
    };
    candidateById.set(c.marketId, hydrated);
    return hydrated;
  }).filter(Boolean);

  const hydrateOne = (id) => {
    if (!id || !byId.has(id)) return null;
    if (candidateById.has(id)) return candidateById.get(id);
    const market = byId.get(id);
    return { ...market, impliedProbability: americanToImplied(market.odds), estimatedProbability: null, edge: null, confidence: null };
  };

  const rank = analysis.rankings || {};
  const rankings = {
    bestBet: hydrateOne(rank.bestBet),
    safest: hydrateOne(rank.safest),
    bestValue: hydrateOne(rank.bestValue),
    bestPlayerProp: hydrateOne(rank.bestPlayerProp),
    bestPlusMoney: hydrateOne(rank.bestPlusMoney),
    pass: rank.pass || []
  };

  const hydrateParlay = (ids) => (ids || []).map(hydrateOne).filter(Boolean);
  return {
    summary: analysis.summary || "",
    candidates,
    rankings,
    parlays: {
      conservative: hydrateParlay(analysis.parlays?.conservative),
      balanced: hydrateParlay(analysis.parlays?.balanced),
      longShot: hydrateParlay(analysis.parlays?.longShot)
    },
    parlayNotes: analysis.parlayNotes || {},
    topThree: hydrateParlay(analysis.topThree),
    warnings: analysis.warnings || []
  };
}
