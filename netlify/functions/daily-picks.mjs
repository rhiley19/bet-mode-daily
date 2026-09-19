import {
  getSportConfig,
  torontoDate,
  fetchTodaysMarkets,
  runResearch,
  hydrateAnalysis
} from "./_shared.mjs";

export default async (req) => {
  try {
    const url = new URL(req.url);
    const sport = String(url.searchParams.get("sport") || "MLB").toUpperCase();
    const date = url.searchParams.get("date") || torontoDate();
    const config = getSportConfig(sport);
    const lowCreditMode = url.searchParams.get("mode") === "low";
    const researchMode = url.searchParams.get("research") === "deep" ? "deep" : "quick";
    const feed = await fetchTodaysMarkets(config, date, { lowCreditMode });
    const markets = feed.markets;

    if (!markets.length) {
      return Response.json({
        ok: true,
        sport: config.label,
        sportKey: sport,
        date,
        generatedAt: new Date().toISOString(),
        latestMarketUpdate: feed.latestMarketUpdate,
        propMode: feed.propMode,
        usageMode: feed.usageMode,
        researchMode,
        oddsQuota: feed.quota,
        summary: "No current pregame or in-play markets were returned for this slate.",
        candidates: [],
        rankings: {},
        parlays: {},
        topThree: [],
        sources: [],
        warnings: ["The odds feed only returns currently available markets. Finished games are excluded.", ...(feed.warnings || [])]
      });
    }

    const research = await runResearch({
      config,
      sport: config.label,
      date,
      markets,
      researchMode,
      extraContext: lowCreditMode ? "LOW CREDIT MODE is active. The market feed intentionally contains only moneylines. Do not imply spreads/totals were checked." : ""
    });
    const card = hydrateAnalysis(research.analysis, markets);

    return Response.json({
      ok: true,
      sport: config.label,
      sportKey: sport,
      date,
      generatedAt: new Date().toISOString(),
      latestMarketUpdate: feed.latestMarketUpdate,
      propMode: feed.propMode,
      usageMode: feed.usageMode,
      researchMode,
      oddsQuota: feed.quota,
      priceNote: "Reference sportsbook prices can differ from FanDuel Canada. A FanDuel Ontario screenshot or pasted price overrides them.",
      ...card,
      warnings: [...(card.warnings || []), ...(feed.warnings || [])],
      sources: research.sources
    }, {
      headers: { "Cache-Control": "public, max-age=90, stale-while-revalidate=240" }
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
};
