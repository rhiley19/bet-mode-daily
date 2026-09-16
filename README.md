# BET MODE Daily — Netlify-ready v2

A clean sports-betting research dashboard built for an Ontario / CAD / FanDuel-first workflow. It generates a daily betting card from real reference market prices, researches current context on the web, rejects bad bets, checks FanDuel screenshots, and tracks results locally.

## Included in v2

### Daily Picks
- MLB, NFL, NHL, NBA, Champions League, Premier League and La Liga.
- Pulls current featured markets (moneyline / spread / total) from The Odds API.
- Current research using OpenAI web search with Sportsnet, TSN, official league sites and reputable statistical sources prioritized.
- Best Bet, Safest, Best Value, Best Player Prop (when prop feed is enabled), Best Plus-Money and PASS decisions.
- Candidate table with actual reference odds, implied probability, estimated probability, edge, confidence, reasoning and main risk.
- Conservative / Balanced / Long-shot parlays only after singles are evaluated.
- Budget allocation with intentional unbet cash.
- Market freshness timestamp and research source trail.

### BET CHECK
- Paste a slip **or upload a FanDuel screenshot**.
- Screenshot is compressed in the browser before upload.
- The model reads visible legs/prices and treats those FanDuel Canada prices as authoritative.
- Every leg gets KEEP / REPLACE / REMOVE, confidence, main risk and a price note.
- Identifies the weakest leg and ticket-level correlation / redundancy risk.

### RESULTS
- Local bet-history tracker (stored in the browser with `localStorage`).
- Tracks stake, odds, result and bet type.
- Calculates net P/L, ROI and win rate.
- No database is required for this first version.

## Important pricing rule

The Odds API bookmaker feed is used as **reference market data**. It is not guaranteed to be identical to FanDuel Canada / Ontario. A price shown in a user-uploaded FanDuel screenshot or pasted slip always overrides the external reference price.

## Deploy to Netlify

1. Unzip this project.
2. Either drag the folder into Netlify or push it to a GitHub repository and import that repository into Netlify.
3. In **Netlify → Site configuration → Environment variables**, add:
   - `ODDS_API_KEY`
   - `OPENAI_API_KEY`
4. Optional:
   - `OPENAI_MODEL=gpt-5.6-luna`
   - `ODDS_INCLUDE_PROPS=true`
   - `MAX_PROP_EVENTS=6`
5. Deploy. `netlify.toml` already defines the publish folder, functions folder, redirects and basic security headers.

## Player props

Player props are intentionally optional because The Odds API serves them through event-specific odds requests, which can consume more API credits. To enable them, set:

```env
ODDS_INCLUDE_PROPS=true
MAX_PROP_EVENTS=6
```

When props are disabled or unavailable, BET MODE returns **PASS** for Best Player Prop rather than inventing a line.

## Local development

```bash
npm install
cp .env.example .env
# Add your keys to .env
npm run dev
```

Then open the local Netlify URL printed in the terminal.

## Data design

**Odds layer:** The Odds API provides actual market IDs and reference prices. The daily-card model can only recommend a market ID supplied by that feed.

**Research layer:** OpenAI Responses API + web search gathers current context. The allow-list includes Sportsnet, TSN, official league sources and reputable stats sites by sport.

**Screenshot layer:** BET CHECK sends the compressed screenshot as image input to the research model. If text or a price is unreadable, the prompt tells the model to say so rather than guess.

**Results layer:** local-only browser storage. Nothing is sent to a database.

## Good next upgrades

- Netlify Blobs / Supabase account-based result history so history follows you across devices.
- Scheduled morning generation and pregame refresh.
- Closing-line-value tracking.
- Line-movement alerts.
- A dedicated FanDuel Canada odds provider if/when one is available to you.
- Optional login / private dashboard.
