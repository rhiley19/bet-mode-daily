import { extractOutputText, parseJsonLoose } from "./_shared.mjs";

function validateImage(dataUrl) {
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(dataUrl || "")) {
    throw new Error("Screenshot must be PNG, JPEG or WebP.");
  }
  if (dataUrl.length > 4_500_000) throw new Error("Screenshot is too large after compression.");
}

function normalizeBet(raw = {}) {
  const outcome = ["win", "loss", "push"].includes(String(raw.outcome || "").toLowerCase())
    ? String(raw.outcome).toLowerCase()
    : null;
  return {
    date: typeof raw.date === "string" ? raw.date : null,
    sport: typeof raw.sport === "string" ? raw.sport : null,
    bet: typeof raw.bet === "string" ? raw.bet.slice(0, 500) : null,
    stake: Number.isFinite(Number(raw.stake)) ? Number(raw.stake) : null,
    odds: Number.isFinite(Number(raw.odds)) ? Math.trunc(Number(raw.odds)) : null,
    outcome,
    type: typeof raw.type === "string" ? raw.type : "Straight",
    actualProfit: Number.isFinite(Number(raw.actualProfit)) ? Number(raw.actualProfit) : null,
    confidence: Number.isFinite(Number(raw.confidence)) ? Math.max(0, Math.min(100, Number(raw.confidence))) : null,
    uncertainFields: Array.isArray(raw.uncertainFields) ? raw.uncertainFields.map(String).slice(0, 8) : []
  };
}

export default async (req) => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "POST required." }, { status: 405 });
  try {
    const body = await req.json();
    const screenshotDataUrl = String(body.screenshotDataUrl || "");
    validateImage(screenshotDataUrl);

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) throw new Error("OPENAI_API_KEY is not configured.");

    const prompt = `You are reading a screenshot of one or more SETTLED sports bets for a personal betting-results tracker in Ontario, Canada.

Extract only information that is visibly supported by the screenshot. Do not research the bet, do not judge the wager, and do not invent unreadable values.

Return JSON only in this exact shape:
{
  "bets": [
    {
      "date": "YYYY-MM-DD or null",
      "sport": "MLB|NFL|NHL|NBA|Soccer|null",
      "bet": "concise human-readable wager/slip description or null",
      "stake": 0.00,
      "odds": -110,
      "outcome": "win|loss|push|null",
      "type": "Straight|Conservative parlay|Balanced parlay|Long shot|Live bet",
      "actualProfit": 0.00,
      "confidence": 0,
      "uncertainFields": []
    }
  ],
  "notes": "brief warning about anything important or uncertain"
}

Rules:
- A screenshot may contain multiple separate settled bets. Return each distinct settled wager separately, up to 12.
- Use the sportsbook's displayed American odds when visible. If only decimal odds are visible, leave odds null rather than converting unless the screenshot itself also shows American odds.
- stake is the amount wagered/risked in CAD when visible.
- actualProfit means net profit/loss, not total return. If the screenshot explicitly shows a payout/return and stake, you may calculate net profit for a win as return minus stake. For a settled loss, actualProfit may be -stake. For a push, use 0. If this cannot be determined confidently, use null.
- For parlays, bet should summarize the visible legs in a readable way; odds should be the TOTAL slip odds, not an individual leg price.
- Use Straight unless it is clearly a multi-leg wager. If it is a parlay but the exact BET MODE category is unknowable, use Balanced parlay as the generic parlay type and mention that in uncertainFields.
- If the wager was clearly placed live, use Live bet.
- confidence is your extraction confidence from 0 to 100, not betting confidence.
- Put any unreadable or ambiguous field names in uncertainFields.
- If a field is not readable, use null. Never guess a player name, team, amount, price, date or result.
- If the image does not show any settled sports bet, return an empty bets array and explain in notes.`;

    const payload = {
      model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
      reasoning: { effort: "low" },
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: screenshotDataUrl, detail: "high" }
        ]
      }]
    };

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`Screenshot reader error ${res.status}: ${txt.slice(0, 280)}`);
    }

    const response = await res.json();
    const parsed = parseJsonLoose(extractOutputText(response));
    const bets = Array.isArray(parsed.bets) ? parsed.bets.slice(0, 12).map(normalizeBet) : [];

    return Response.json({
      ok: true,
      bets,
      notes: typeof parsed.notes === "string" ? parsed.notes.slice(0, 700) : ""
    });
  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
};
