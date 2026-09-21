import { getSportConfig, torontoDate, runBetCheckResearch, fetchTodaysMarkets } from "./_shared.mjs";

function fallbackSlip(slipText, warning) {
  const lines = String(slipText || "")
    .split(/\n+/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter((x) => x.length > 2)
    .filter((x) => !/^(fanduel|sportsbook|bet slip|share bet|receipt|wager)$/i.test(x));

  const legs = [];
  const seen = new Set();
  for (const line of lines) {
    const oddsMatch = line.match(/(?:^|\s)([+-]\d{3,4})\b/);
    const cleaned = line.replace(/(?:^|\s)[+-]\d{3,4}\b/, "").trim();
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    if (cleaned.length < 4) continue;
    seen.add(cleaned.toLowerCase());
    legs.push({
      bet: cleaned.slice(0, 300),
      odds: oddsMatch ? oddsMatch[1] : "unknown",
      verdict: "REVIEW",
      confidence: 0,
      why: "The slip was extracted, but the research engine was unavailable for a full assessment.",
      mainRisk: "Current matchup and availability information has not been verified.",
      priceNote: oddsMatch ? "User-supplied price preserved." : "Price could not be read."
    });
    if (legs.length >= 12) break;
  }

  if (!legs.length) {
    legs.push({
      bet: "Uploaded bet slip",
      odds: "unknown",
      verdict: "REVIEW",
      confidence: 0,
      why: "The screenshot was received, but no reliable text was available to the server.",
      mainRisk: "Leg details need to be reviewed manually.",
      priceNote: "Use the local OCR text box or paste the slip text."
    });
  }

  return {
    summary: "Your bet slip was preserved, but full research is temporarily unavailable.",
    extractedSlip: legs.map(({ bet, odds }) => ({ bet, odds })),
    legs,
    weakestLeg: "Research unavailable",
    combinedRisk: "Ticket-level risk could not be fully evaluated without the research engine.",
    recommendation: "Review the extracted legs and prices before placing the wager. Retry research when the engine is available.",
    warnings: [warning || "Research engine unavailable."]
  };
}

export default async (req) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "POST required." }, { status: 405 });

  let slipText = "";
  let screenshotDataUrl = null;
  try {
    const body = await req.json();
    const sport = String(body.sport || "MLB").toUpperCase();
    const date = body.date || torontoDate();
    const config = getSportConfig(sport);
    slipText = String(body.slipText || "").slice(0, 12000);
    screenshotDataUrl = body.screenshotDataUrl ? String(body.screenshotDataUrl) : null;
    const deepResearch = Boolean(body.deepResearch);

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
        referenceWarning = "Reference odds unavailable: " + error.message + ". The slip can still be reviewed from the user-supplied information.";
      }
    } else {
      referenceWarning = "Skipped the external odds request because the FanDuel screenshot/pasted slip already supplied the wager price.";
    }

    try {
      const research = await runBetCheckResearch({
        config,
        sport: config.label,
        date,
        markets: feed.markets,
        slipText,
        imageDataUrl: screenshotDataUrl,
        deepResearch
      });

      if (referenceWarning) {
        research.analysis.warnings = [...(research.analysis.warnings || []), referenceWarning];
      }

      return Response.json({
        ok: true,
        degraded: false,
        date,
        sport: config.label,
        analysisMode: research.mode || (deepResearch ? "deep" : "fast"),
        result: research.analysis,
        sources: research.sources,
        latestMarketUpdate: feed.latestMarketUpdate,
        oddsQuota: feed.quota
      });
    } catch (researchError) {
      const warning = "Research engine unavailable: " + researchError.message;
      const result = fallbackSlip(slipText, warning);
      if (referenceWarning) result.warnings.push(referenceWarning);
      return Response.json({
        ok: true,
        degraded: true,
        date,
        sport: config.label,
        analysisMode: "local-fallback",
        result,
        sources: [],
        latestMarketUpdate: feed.latestMarketUpdate,
        oddsQuota: feed.quota,
        engineWarning: warning
      });
    }
  } catch (error) {
    const result = fallbackSlip(slipText, "Bet Check request error: " + error.message);
    return Response.json({
      ok: true,
      degraded: true,
      analysisMode: "local-fallback",
      result,
      sources: [],
      engineWarning: error.message
    });
  }
};
