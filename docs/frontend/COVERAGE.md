# Website correction coverage

| Current requirement | Implemented evidence | Limit |
| --- | --- | --- |
| “trading is allowed when the escrow's on-chain graph is consistent … and matches the published docs” | `service.ts` follows escrow SQUEEK/SQK → NFT.mining → Mining configuration/core, verifies code and chain 11155111 against shipped and live docs; checked again for each signature. Live check passes. | Live documentation must remain verifiable. |
| API mismatch becomes the specified visible warning | `apiDeploymentWarning` and the separate status in `App.tsx`; live screenshot and successful documented-SQK/escrow transaction test. | Identity metadata is advisory; it never supplies targets or eligibility. |
| “Keep blocking … graph … inconsistent or … RPC … unavailable” | Nine graph variants, per-dependency missing code, wrong chain, initial and pre-sign RPC failures tested. | Cancellations/refunds retain their separate original-escrow chain/code checks and simulation. |
| Wallet Squeeks, levels, merge readiness and transaction data from documented contracts | `loadWallet`, `inspectToken`, planner and board use documented chain state/events. API account/Squeek endpoints removed. Regression verifies holdings, levels, cooldown, readiness, board, planner and merge target under API mismatch. | Board is an explicitly indexed snapshot; Inspect wallet reads live readiness. No matching documented staking integration exists. |
| “Use the API only for hamster pace, wheel status and Squeek art, and label it” | Source-labelled hamster/wheel telemetry; no API-derived balances, levels, custody, readiness, rewards or transaction targets. Economy identities only support the separately requested mismatch warning. Decorative partner art remains local. | Newer-deployment pace is not used for documented reward or cooldown-time forecasts. |
| Footer escrow and documented set, newer-deployment note | Always-visible definition list from runtime escrow plus published snapshot. All five full explorer links/copy controls remain available during RPC outage. | Addresses wrap on phones. |
| Responsive usable site and primary interactions | 62 passing tests; 320/390/820/1440 reflow; real 390 and desktop export inspected; wallet and lookup on first screen. | No physical device or live signing. |
| Static export alongside source and lockfile; relative URLs | Root `dist/` and `web/`; existing package/lockfile unchanged; all 38 exported files match HTTP/hash audit. | Serve over HTTP(S). |
| Build, typecheck, interaction checks and honest results | Current `VALIDATION.md` and JSON evidence. | Worker evidence, not independent certification. |
| Pinned Better Interface and six-domain review | Applied during correction; six-domain coverage, source locations, fixes and limitations in `VALIDATION.md`; final taste 16/16. | WebKit launch unavailable due missing system libraries; manual assistive-device checks unperformed. |
| First screen at 390 and complete share metadata | Main action bottom 580.375px at 390 × 844; title/favicon/description/og:title/og:image verified. | Hosted absolute OG URL is assigned after delivery. |
| Root DESIGN.md and README instructions | Root design document reflects final source; root and web READMEs describe installation, preview, rebuild, checks and data authority. | Publication is outside this website correction. |

The deployed escrow, contract source, dependencies, lockfile, build configuration and ignore files are unchanged. Required runtime assets remain complete; no submodule or dependency/cache archive was added.
