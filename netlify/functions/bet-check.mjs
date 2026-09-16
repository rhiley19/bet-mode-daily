import { getSportConfig, torontoDate, runBetCheckResearch, fetchTodaysMarkets } from "./_shared.mjs";

export default async (req) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "POST required." }, { status: 405 });
  try {
    const body = await req.json();
    const sport = String(body.sport || "MLB").toUpperCase();
    const date = body.date || torontoDate();
    const config = getSportConfig(sport);
    const slipText = String(body.slipText || "").slice(0, 8000);
    const screenshotDataUrl = body.screenshotDataUrl ? String(body.screenshotDataUrl) : null;

    if (!slipText.trim() && !screenshotDataUrl) {
      return Response.json({ ok: false, error: "Paste your slip or upload a FanDuel screenshot." }, { status: 400 });
    }

    const feed = await fetchTodaysMarkets(config, date);
    const research = await runBetCheckResearch({
      config,
      sport: config.label,
      date,
      markets: feed.markets,
      slipText,
      imageDataUrl: screenshotDataUrl
    });

    return Response.json({
      ok: true,
      date,
      sport: config.label,
      result: research.analysis,
      sources: research.sources,
      latestMarketUpdate: feed.latestMarketUpdate
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
};
