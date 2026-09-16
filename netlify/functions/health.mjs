export default async () => Response.json({
  ok: true,
  oddsApiConfigured: Boolean(process.env.ODDS_API_KEY),
  openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
  model: process.env.OPENAI_MODEL || "gpt-5.6-luna",
  propMode: String(process.env.ODDS_INCLUDE_PROPS || "false").toLowerCase() === "true"
});
