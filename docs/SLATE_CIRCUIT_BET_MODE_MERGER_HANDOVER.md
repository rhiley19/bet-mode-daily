# Slate Circuit × Bet Mode — Merger & Collaboration Handover

**Prepared:** November 6, 2026  
**Purpose:** Working handover for the project owner and collaborator.  
**Status:** Planning document; Slate Circuit source has not yet been inspected.

## Vision
Combine Slate Circuit and Bet Mode Daily into one FanDuel Ontario–first sports-betting research platform for slate discovery, price-aware analysis, bet-slip review, and performance tracking. Never promise wins, fabricate odds, or force a bet.

## Existing projects
| Asset | Current information | Next action |
|---|---|---|
| Bet Mode Daily | https://bet-mode-daily.netlify.app/ | Verify production deployment and APIs |
| Bet Mode source | Private repo https://github.com/rhiley19/bet-mode-daily | Test frontend, functions, data flow |
| Desktop app work | PR #2: https://github.com/rhiley19/bet-mode-daily/pull/2 | Review and test before merging |
| Slate Circuit | https://slate-circuit.gwapo888.chatgpt.site/ | Obtain source access and feature inventory |
| Existing bet history | Owner confirmed CSV export from phone | Keep backup and verify import schema |

## Combined product
1. **Slate Dashboard:** games and markets by sport, date, and matchup; display freshness.
2. **Bet Mode Research:** real reference odds, implied and estimated probabilities, risk, edge, evidence, and PASS decisions. Reference prices are not guaranteed FanDuel Ontario prices.
3. **Bet Slip Studio:** screenshot upload and pasted text, editable extracted legs and odds, copyable ticket. Research failure must never erase the extracted slip.
4. **Results & Bankroll:** CSV import, stake and outcome tracking, P/L, ROI, pending wagers, audit trail.
5. **Cross-device Sync:** authenticated user accounts and secure cloud storage. Preserve local phone data until migration is verified.
6. **Desktop + Mobile:** responsive site and optional installable Windows app.

## Integration approach
Do not merge blindly. Compare features and dependencies in both apps, choose one primary codebase and design system, then migrate components behind clear interfaces. Avoid duplicate APIs, parallel data stores, and incompatible authentication.

**Provisional architecture:** Dashboard / Daily Card / Bet Check / Results / Settings frontend; a single backend using Netlify Functions or another agreed provider; separate odds, research, OCR, and persistence services; user-scoped database permissions. Keep API secrets server-side. Add request IDs, error logs, quota controls, and stale-data indicators.

## Roadmap
### Phase 0 — Inventory and protect
- Invite collaborator using GitHub permissions rather than shared passwords.
- Preserve CSV backups and record deployment/branch status.
- Inventory Slate Circuit source, dependencies, screens, and features.

### Phase 1 — Reliability
- Reproduce Bet Check failures using sanitized screenshots and text.
- Test OCR, parsing, API timeouts, fallback, copied slips, duplicate legs, and invalid odds.
- Review desktop-install PR #2 and validate update/offline behavior.

### Phase 2 — Unified experience
- Select primary repo, brand, and visual design.
- Implement common navigation and shared analysis components.
- Consolidate data models and remove duplicated functionality.

### Phase 3 — Account sync and migration
- Select authentication/database provider and set user-scoped access controls.
- Add CSV preview, duplicate detection, and reversible migration.
- Verify the same history on phone and Windows before retiring local-only storage.

### Phase 4 — Release
- Deploy staging, run QA, cap service costs, and establish rollback.
- Release to production only after both collaborators sign off.

## Suggested responsibilities
- **Project owner:** vision, betting workflow, feature acceptance, product testing.
- **Collaborator:** Slate Circuit source access, UI review, implementation and testing.
- **Shared:** architecture, pull-request review, documentation, release approval.

## Definition of done
- A screenshot yields an editable slip even when research fails.
- Every displayed price identifies its source and timestamp.
- CSV imports preserve all records without silent duplicates.
- Signed-in results match across phone and Windows.
- Desktop install and updates pass testing.
- Changes are reviewed in a PR and validated in staging.

## Open decisions
- What does Slate Circuit currently do, and where is its repository?
- Which UI and brand should be primary?
- Who owns deployments, domain, API subscriptions, and costs?
- Which auth/database provider and monthly budget are acceptable?
- Will the combined product be called Slate Circuit, Bet Mode, or something new?

## First collaboration meeting (30 minutes)
Open both apps, inventory features, confirm repository access, assign Phase 0 tasks, choose staging, and agree on the first integration PR. Do not merge or deploy before backup and QA.
