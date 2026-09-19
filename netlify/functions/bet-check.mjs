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

    const hasUserPrice = Boolean(screenshotDataUrl) || /(^|\s)[+-]\d{3,4}\b/.test(slipText);
    let feed = { markets: [], latestMarketUpdate: null, quota: null };
    let referenceWarning = null;

    if (!hasUserPrice) {
      try {
        feed = await fetchTodaysMarkets(config, date, { lowCreditMode: true });
      } catch (error) {
        referenceWarning = `Reference odds unavailable: ${error.message}. The slip can still be reviewed from the user-supplied information.`;
      }
    } else {
      referenceWarning = "Skipped the external odds request because the FanDuel screenshot/pasted slip already supplied the wager price.";
    }

    const research = await runBetCheckResearch({
      config,
      sport: config.label,
      date,
      markets: feed.markets,
      slipText,
      imageDataUrl: screenshotDataUrl
    });

    if (referenceWarning) {
      research.analysis.warnings = [...(research.analysis.warnings || []), referenceWarning];
    }

    return Response.json({
      ok: true,
      date,
      sport: config.label,
      result: research.analysis,
      sources: research.sources,
      latestMarketUpdate: feed.latestMarketUpdate,
      oddsQuota: feed.quota
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
};
