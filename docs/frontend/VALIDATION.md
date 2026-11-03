# SqueekMatch website update: validation

Validated 2026-11-03 UTC against the final production export. Complete for the stated website-only scope. These are worker observations, not independent certification. The escrow, Solidity source, deployment handoffs, dependencies and existing build configuration were preserved.

## Result

Trading is available when the Sepolia escrow and its documented on-chain graph verify. The real API deployment mismatch is a visible advisory. API outage or delay cannot block verification, wallet lookup or signing. Inconsistent on-chain links, missing code, wrong chain, unavailable RPC and unverified live documentation still fail closed.

Production build, strict TypeScript and deployment/asset verification pass. **62/62 Playwright tests pass**, with no failures, skips or flaky results. The pinned **taste@1 probe passes 16/16 checks**. Automated axe checks found zero violations for their selected WCAG tags across the five primary views and wallet dialog. No transaction was signed or broadcast on Sepolia.

The final export contains **37 inventoried assets plus its manifest, 1,057,468 bytes total**. Its largest file is 364,541 bytes. All 38 files were fetched from a strict static subpath and matched to the source export and manifest hashes. Entrypoint asset URLs are relative; title, description, favicon, og:title and og:image are present.

## Commands and outcomes

Dependencies were installed with the unchanged `web/package.json` and lockfile in a temporary copy under `/tmp/`; no repository dependency directory or protected build file was touched. Build output was copied back byte-for-byte to root `dist/`. Runtime: Node 24.22.1 and npm 11.19.1.

| Command/check | Actual result |
| --- | --- |
| `npm ci --cache /tmp/squeekmatch-npm-cache --no-audit --no-fund` in the temporary `web/` copy | Pass. Existing lockfile retained. |
| `npm run typecheck` | Pass, `tsc --noEmit`. |
| `npm run build` | Pass. Vite production export and manifest generated after the last application source change. |
| `npm run verify` | Pass. Exact deployment/network binding and canonical escrow ABI Keccak match the handoff; all final export assets inventoried. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeekmatch-browsers npm test` | Final run: 62 passed in 80.1 seconds, 0 failed/skipped/flaky. Static export served at `/preview/`. All chain, API and wallet test requests mocked. |
| `IMD_PLAYWRIGHT=/tmp/squeekmatch-fix/web/node_modules/playwright/index.mjs PLAYWRIGHT_BROWSERS_PATH=/tmp/squeekmatch-browsers node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` from repository root | Final run: 16/16 pass at 320, 390 and 1440, including reduced motion. |
| Bounded HTTP export audit | Pass: 37 assets and manifest, all responses 200, SHA-256 inventory and exported bytes match. `export-audit.json`. |
| Read-only Sepolia graph check | Pass at block 12053582, including an exact requested/returned block-number round trip. `live-read-check.json`. |
| Playwright WebKit install and launch | Browser downloaded; launch failed because GTK/GStreamer and other system libraries are absent. WebKit rendering remains unperformed. |
| `git diff --check` and path/byte audit | Pass; final counts in `scope-audit.json`. No ignore file or protected file changed; no dependency archives/caches or new submodule included. |

The first browser-suite attempt used an incompatible pre-existing browser revision and was stopped; a matching Chromium was installed outside the repository. An added RPC-loss test initially injected the outage before its asynchronous review preparation completed. It now waits for the review button to appear, then injects the outage; targeted and complete reruns pass. The first design probe found one nested warning surface; the final probe confirms its correction.

## Meaningful interactions

The included suite exercises address lookup and invalid input; on-chain holdings, levels, cooldowns, readiness and rewards; planner input and separately confirmed path bids; Match board indexing, filtering and cache reuse; create/fill/cancel for asks, bids and swaps; exact SQK/NFT approvals; receipt locking; claims; merge previews and irreversible-burn acknowledgment; wrong-chain recovery and add-chain parameters; named EIP-6963 wallets; phone app-browser links; Coinbase entry; and ABI-tampering rejection.

New regressions establish that:

- API token/Mining/Core mismatch shows the requested warning while approving the documented SQK and submitting to the original escrow.
- API failure still permits approvals/orders. An intentionally unresolved API does not delay required verification or wallet lookup.
- The mismatch cannot alter wallet holdings, planner inputs, board levels or the documented Mining merge target. No account or Squeek-detail API is requested.
- Nine graph inconsistencies, code absence at each dependency, wrong RPC chain, RPC failure and documentation mismatch/outage block trading.
- Graph changes and RPC loss after opening a transaction review block the first approval signature.
- The footer contains all five documented addresses even when RPC verification is unavailable.

The suite validates all five views at 320, 390, 820 and 1440. It also covers very large exact SQK amounts, full addresses and 200% text enlargement. That is not native browser zoom.

## Live observations

Public source: `https://ethereum-sepolia-rpc.publicnode.com`. At Sepolia block **12053582**, chain ID was **11155111**, and all five contracts had code. The escrow immutables, NFT mining link, Mining token/genesis/core configuration and collection policy matched both the shipped snapshot and live published docs. SQK reported 18 decimals. `nextOrderId()` was 1, so the displayed empty market is real.

The API reported a different token/Mining/Core set. The final rendered website displayed **Identity checks passed** and the exact requested API warning together. Its required verification never calls the API. Graph/configuration and dependency code checks use one explicit block. Wallet ownership, positions, readiness and balance checks also share a fresh explicit block after event discovery.

## Better Interface review

Applied the pinned workflow and all six domains during this existing-site correction. One visual idea remains: warm paper and forest-green task controls, with the lookup and wallet action before explanation. No unrelated redesign was introduced.

| Domain | Checked coverage | Unperformed/not applicable |
| --- | --- | --- |
| Accessibility | Native fields/links/buttons, bound labels, focus styles and live statuses reviewed in source; keyboard-opened wallet sheet, visible close focus, Escape/focus return inspected; axe passes on every primary view and wallet sheet. | No screen-reader or physical assistive-device session. |
| Layout | Production export inspected in Chromium at 390 and 1440; footer wrapping inspected at 390; tests cover 320/390/820/1440 and 200% text enlargement. No measured horizontal overflow. | Native zoom, RTL and pseudo-localization unperformed; English-only interface. |
| Writing | Required-vs-advisory identity copy, source labels, newer-deployment note, transaction consequences and recovery text checked. Probe measures 26 prose words on the first 390 screen, under 60. | No user study or translation review. |
| Typography | Local DM Sans confirmed loaded. Existing six-token scale and 400/500/700 weights retained; probe sees at most five rendered sizes; full addresses and exact amounts wrap. | Other operating systems and WebKit font rendering unperformed. |
| Colors | Final rendered text probe passes. Actual API warning foreground is `rgb(117,80,22)` on verification background `rgb(238,239,228)`, measured **6.21:1**. Text/page **11.14:1**, muted/surface **5.20:1**, warning/background **6.47:1**, focus/surface **6.43:1**. | These are identified solid pairs, not every possible wallet/native overlay. No OS high-contrast session. Single light theme; dark-theme testing not applicable. |
| UI | Verified and paused states, advisory warning, empty market, loading/error paths, wallet dialog and footer examined. Motion/source checks and reduced-motion tests pass; no nested warning card remains. | Real extension prompts, Coinbase passkeys, physical phone links and live transaction receipts unperformed. |

## Findings, fixes and rechecks

| Severity / final source location | Finding and correction | Evidence/recheck |
| --- | --- | --- |
| High · `web/src/service.ts:136` | API identity and availability previously blocked the verified documented deployment. Required verification now uses only chain and documentation; API comparison is separate advisory display logic. | Live site shows verified state plus warning; API mismatch/outage/delay tests pass. |
| High · `web/src/service.ts:252`, `web/src/Trade.tsx:41` | API accounts/custody could describe the other deployment and delayed lookup/previews. Removed these requests; holdings, positions, readiness, balances and transaction facts use documented contracts. | Tests confirm expected holdings/levels/readiness and documented transaction targets, with no account/Squeek API calls. |
| Medium · `web/src/Singles.tsx:261`, `web/src/Planner.tsx:201` | Pace from another deployment could be combined with documented economics or cooldowns. Removed SQK/day and cooldown-hour extrapolations; retained on-chain power/block calculations and separate labelled telemetry. | Planner and lookup tests pass; source boundary reviewed. |
| Medium · `web/src/service.ts:211` | A combined Mining graph failure could display identical token addresses when its genesis/core link was wrong. Each required link now has its own expected/observed row. | Nine graph-failure tests pass. |
| Medium · `web/src/App.tsx:744`, `web/src/styles.css:858` | The documented set previously depended on loaded graph data and was hidden in a disclosure. Added an always-visible wrapping footer with all five addresses and the newer-deployment note. | RPC-outage footer test and actual 390 footer screenshot pass; no overflow. |
| Medium · `web/src/App.tsx:521`, `web/src/styles.css:864` | Initial new warning introduced a card inside the verification card. Replaced it with inline warning text and a leading rule. | First probe flagged `chrome`; final probe passes, actual desktop screenshot inspected, warning contrast 6.21:1. |

No unresolved applicable high/medium finding remains in this correction's scope. Root `DESIGN.md` documents the final implemented tokens, type, layout and components.

## Evidence and limitations

- `evidence/final-live-mobile.png`: final 390 × 844 first screen. Main lookup button spans y=536.375–580.375, fully visible with the product and wallet control.
- `evidence/final-live-desktop.png`: final 1440px screen with real empty market, passing identity and API warning.
- `evidence/final-contract-footer.png`: final 390px footer, five full wrapping addresses and newer-deployment note.
- `evidence/final-wallet-sheet.png`: keyboard-opened wallet sheet with visible focus. Escape returns to its opener.
- `interaction-results.json`, `taste-results.json`, `live-read-check.json`, `export-audit.json`, `scope-audit.json`: current machine-readable results, without account configuration or private data.

WebKit/Safari, physical devices, screen readers, real wallet extensions/passkeys, native app opening, native zoom, live signing and dropped/replaced receipts were not validated. Confirmed event discovery has a 12-block delay; first public log scans may be slow, and reorgs deeper than the replay tail may require clearing the event cache. The Match board labels its indexed snapshot and sends visitors to Inspect wallet for live readiness. The documented deployment supplies no matching staking/deposited-merge integration, so deposited holdings are not invented from the newer API. No on-chain deployment or publication was performed by this task.
