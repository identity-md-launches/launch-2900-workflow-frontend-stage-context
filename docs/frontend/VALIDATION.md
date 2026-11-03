# SqueekMatch worker validation

Validated 2026-11-02–03 UTC against the delivered production export. This is worker evidence, not independent certification and not the later publication check.

## Result

The frontend source, lockfile, static export, runtime deployment manifest and documentation are complete for this worker's delivery scope. The real deployment remains **readable with trading/merging paused**, because the live API identities disagree with the documented on-chain graph. Deposited merging is explicitly unavailable because the matching deployment publishes no Staking/mergeDeposited integration. Neither gap is filled with a substitute address or selector.

The export contains 37 declared assets plus the manifest, **1,055,895 bytes** total; two complete named/immutable response-body copies are about 2.02 MiB before RPC overhead. The largest file is 363,514 bytes. This leaves substantial room under the publication response budget.

Final application checks: production build/typecheck pass; **41 Playwright tests pass**, zero skipped/flaky/failing; **16/16 taste@1 checks pass**. Automated axe checks report zero violations across the five primary views and the wallet dialog for the tested WCAG rule tags. Those checks do not establish screen-reader or physical-device behavior.

## Scope and configuration binding

- Source is under `web/`; root `dist/` is the actual served static export. Hash navigation and `base: './'` were exercised at `/preview/` without route rewrites.
- The app fetches `imd-deployment.json` at runtime and loads its referenced escrow ABI. Startup rejects a changed ABI hash before wallet controls load; the interaction suite covers that rejection.
- The complete contract set, source commit, launch ID, attestation hash and chain ID come from the supplied handoff. The network and wallet-add-chain objects are copied unchanged. This `evm_contracts` handoff has no poolKey; none is invented. P2P NFT swaps use the escrow, not an invented Uniswap route.
- Pinned ABI raw bytes from `git show ba6069873530d6484250b8ed574a70b0a7200068:docs/abi/SqueekMatchEscrow.json` and `web/public/abi/SqueekMatchEscrow.json` both SHA-256 to `16006c7c02a4f95b5e1d51c367e8d5dfa40e6d1128bc89f0eb00ef0deae9a4e1`. Canonical JSON (recursive key sorting, array order preserved) Keccak is `000dd3c70055e309aeaa0c7ea80a1a8e5c4e0051ac51ad85843d5b5aebdef12b`, matching the handoff.
- External ABI/snapshot provenance is retained in `web/public/official/provenance.json`. Transaction dependency addresses are resolved from escrow/NFT/mining contract reads. API results never select them.

## Commands and observed outcomes

| Command / check | Outcome |
| --- | --- |
| `npm install --prefix web …` with explicit temporary caches | Installed normal frontend dependencies; package/lockfile stay in `web/`; `npm ls --prefix web --depth=0` reports a valid dependency tree. |
| `npm --prefix web run typecheck` | Pass, strict TypeScript. Also runs in every production build. |
| `npm --prefix web run build` | Pass; emits root export and then the deployment/asset manifest. The final extra license asset does not change the tested JS/CSS bytes. |
| `npm --prefix web run verify` | Pass; exact contract/ABI binding, network object, wallet-add parameters and every exported file's final SHA-256 inventory. |
| `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeekmatch-browsers npm --prefix web test` | 41/41 pass against the production export, with a test-owned strict static server. All signing, RPC and API interactions are mocked. |
| `IMD_PLAYWRIGHT=…/web/node_modules/playwright/index.mjs node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste` | 16/16 pass with live reads at 320, 390 and 1440; includes reduced motion. Full output is `taste-results.json`. |
| Local HTTP asset audit | Every declared file fetched at a subpath and matched against its manifest SHA-256; no missing OG image or ABI asset. See `export-audit.json`. |
| `git diff --check`, permitted-path and added-file-byte audit | Pass. Only `web/**`, `dist/**`, `docs/**`, and the explicitly budgeted `web/.gitignore` are included. No protected contract/build files changed. |

The final browser suite also checks 820px. It exercises all create/fill/cancel controls, exact SQK and NFT approval arguments, 7-day/default expiry, one-sided swap differences, my-order access, direct order lookup, post-fill merge selection, survivor/donor confirmation, separate sorted reward claims, cooldown/pending-power gates, planner bids, IndexedDB reuse, RPC failure, ABI tampering, initial/fresh API mismatch, API outage, wallet rejection, missing-chain add/switch, wrong-network recovery and mobile app links. SQK parser/formatter tests preserve one base unit and values beyond JavaScript's safe integer range. Long-value browser tests use full addresses and a 2^255-sized SQK amount at 320/390.

## Live reads, without broadcasting

`live-read-check.json` records the separate read-only observation at Sepolia block **12051553**:

- RPC returned chain **11155111** and nonempty code at the exact attested escrow.
- Escrow-derived NFT/SQK/mining/core match the supplied documented graph; SQK reports 18 decimals.
- `nextOrderId()` was **1**, so the real empty market is not sample data.
- API token/mining/core differ from those derived addresses. The app displays the mismatch, excludes mismatched API holdings/pace, and disables approvals, fills, creates and merges. Cancels/refunds still use the attested escrow and a dry run.
- **No worker transaction was signed or broadcast.** Later control-plane RPC/asset checks and real wallet swaps/merges are not claimed by this evidence.

## Better Interface review

One visual idea: a quiet, warm-paper companion tool where two small hamster shapes make the purpose legible, while forms and chain facts carry the interaction. There is no marketing hero before the product.

| Domain | Coverage and evidence | Limitations |
| --- | --- | --- |
| Accessibility | Checked native controls, heading order, labels/descriptions, dialog focus containment/Escape/return, keyboard skip/focus, persistent errors, dynamic status and reduced motion. Automated axe checks pass on all five routes and wallet sheet. | No screen-reader, native Safari or physical-device session. |
| Layout | Checked all five views at 320/390/820/1440, large balances, full identity details, bottom sheet and 200% text enlargement. No sideways scroll. Default main action at 390 × 844 has y=536.375 and height=44: entirely within the first screen. | Text enlargement is not browser-native zoom. RTL/pseudo-localization were not exercised; English-only is the delivered language. |
| Writing | Source review of action labels, custody/escrow/expiry explanations, permanent merge consequences, unavailable-data copy and mismatch recovery. Probe first-screen prose: 26 words at 390, below its 60-word bar. | No user study or translation review. |
| Typography | Loaded local DM Sans confirmed by `document.fonts.check`; one family and three weights. Probe sees at most five sizes including one-offs. Inputs are 16px. Amounts preserve all base units; addresses wrap. | Other operating-system font rendering was not sampled. |
| Colors | Final rendered text probe passes. Browser-computed input, primary and warning pairs match the source tokens; explicit text/focus/control calculations below. Selected state also has an underline. | Forced-colors CSS was reviewed, but an OS high-contrast session was not performed. |
| UI | Inspected empty/read/loading/paused, connect sheet, visible focused close, state/error/receipt flows through mocked interactions; native table/disclosures, flat surfaces and restrained motion. | Real extension prompts, Coinbase passkeys, native phone links and real receipt/replacement edge cases were not exercised. |

Measured identified pairs, using sRGB WCAG luminance and the observed resolved solid backgrounds: text `#203c31`/page `#f7f7f0` **11.14:1**; muted `#607065`/surface `#fffef9` **5.20:1**; warning `#755016`/`#fcf2dc` **6.47:1**; error `#913c29`/`#fcebe5` **6.30:1**; focus `#315f9a`/surface **6.43:1** and focus/selected `#e5edb0` **5.28:1**. These are specific pairs, not an assertion about every possible overlay or native wallet UI. The probe separately measures all text it can resolve on the rendered entry view.

## Findings, corrections and rechecks

| Severity / location | Finding, change and evidence |
| --- | --- |
| Medium · `web/src/components.tsx:165` | A wrapping field label included its hint in the accessible name, causing exact-label interaction failures. `Field` now binds a separate native label and `aria-describedby` hint. Address/form interactions and axe rechecks pass. |
| Medium · `web/src/styles.css:1353` | Mobile aside children retained grid `align-items:start` after becoming flex, leaving panels unnecessarily narrow in the observed 390 screenshot. Mobile aside now stretches children. Final mobile/desktop screenshots and reflow tests confirm full usable width. |
| Medium · `web/src/styles.css:24` | Structural separators were also input boundaries. Added a dedicated stronger `--control-line`; kept light separators structural. Final browser-computed input border is `rgb(126,139,119)`, distinct from surface, with visible keyboard focus. |
| Medium · `web/src/App.tsx:414` | Ten empty price rows pushed the identity warning far down the entry view and left a large blank primary column. Empty-book prices now sit in a native disclosure with a visible affordance; all levels remain accessible. Data rows are a semantic table. Final desktop screenshot shows the warning within the first screen. |
| Low · `web/src/App.tsx:497` | Successful verification inherited amber styling. Successful state now uses neutral tokens; amber remains checking/paused. Source review and mocked verified-page accessibility checks pass. |
| Medium · `web/src/config.ts:30` | Rabby app-browser link needed the vendor handler's actual query contract. It now uses `/mobile/?_cmd=open-dapp&dapp=…`; the source and encoded current-page URL are checked. Undefined `window.ethereum` is treated as no provider. Native opening remains unverified. |
| High · `web/src/domain.ts:7` | A four-decimal formatter could turn a positive sub-0.0001 amount into a misleading zero-like string in confirmations. Full base-unit precision is preserved. Tests cover one positive/negative base unit and large exact values; browser long-value reflow passes. |
| Medium · `web/src/Merge.tsx:104` | Official claims require ascending IDs even when the user chooses the higher ID as survivor. Claim IDs are sorted; merge IDs retain exact survivor/donor order. The interaction test uses reversed input IDs and confirms `[0,[1,2]]` for claim. |
| Medium · `web/src/Transactions.tsx:38` | A known submitted hash must not become a resend action after a receipt lookup fails. The review retains it and offers confirmation lookup only. Normal receipt lock/refresh behavior is tested; a real dropped/replaced transaction remains a stated live-chain limitation. |
| Low · `web/src/service.ts:549` | Statistics endpoint initially answered HTTP 400 because it requires `range=7d`. Corrected the query using the published API specification; final live probe has no failed local resources or script errors. The merging-help link was also corrected to the actual `/squeeks/merge/` route. |

No unresolved high/medium finding remains in the reviewed frontend scope. The upstream identity conflict and unavailable deposited integration remain explicitly visible; they are not classified as corrected chain behavior.

## Evidence and limits

- `evidence/final-live-mobile.png`: actual 390 × 844 first screen, wallet and main lookup action visible.
- `evidence/final-live-desktop.png`: actual 1440px entry view, empty live market and paused identity state.
- `evidence/final-wallet-sheet.png`: keyboard-opened native dialog with visible 2px focus ring. Escape returned focus to its opener.
- `interaction-results.json`: sanitized final Playwright outcomes with durations and no local-machine paths.
- `taste-results.json`, `export-audit.json`, `live-read-check.json`: machine-readable design/export/live-read records.

The first WebKit download hit temporary storage quota; after clearing this task's redundant temporary downloads it installed, but could not launch because required GTK/GStreamer and related shared libraries are absent. **WebKit rendering was not performed.** Chromium and the supplied browser tool worked. No permission or missing requester value was needed to finish this source/export delivery.

Screen readers, physical phones, real wallet extensions, passkey signup, live approvals/trades/claims/merges, dropped/replaced transactions and native browser zoom were not validated. Long initial public-log scans and reorgs deeper than the replay tail are disclosed operational limits. IPFS publication, naming, absolute hosted Open Graph URLs and the control plane's immutable/named-copy checks happen after delivery.

The explicit ignore-file path budget is **one file: `web/.gitignore`**. Required source, local runtime assets, ABI files, lockfile, static export and evidence remain present. Dependency directories/caches, browser downloads, registry archives, scratch traces and submodules are excluded. `docs/DESIGN.md` supplies the required design-system content within the overriding permitted paths.

## Local Git limitation

The attempted `git add -- web dist docs` returned `fatal: Unable to create .git/index.lock: Read-only file system`. Git metadata is protected on this worker, so staging and a local commit were not possible. All source/export/evidence files are present in the allowed paths for collection; no local commit hash or completed publication is claimed.
