# SqueekMatch frontend

An unofficial, fee-free Squeekchain merge-partner finder and peer-to-peer SQK market. Vite, React, TypeScript, wagmi and viem. Plain static files; hash navigation; no backend, relay, private keys or WalletConnect account.

## Install, build and serve

Use Node 22.12+ (worker validation used Node 26.11.1) and npm with registry access:

```sh
cd web
npm ci
npm run typecheck
npm run build
npm run verify
npm run preview
```

`build` writes repository-root `dist/`, then generates `dist/imd-deployment.json` from final asset bytes. Preview the generated files, rather than opening `index.html` with `file://`; browser RPC, fetch and wallet APIs require HTTP(S). Vite uses `base: './'`, local fonts and assets, and hash navigation. The export also works at a gateway subpath without server rewrites.

`npm run dev` is a development server. For the same strict static subpath used in validation, run `node scripts/serve.mjs --port 4175` and open `http://127.0.0.1:4175/preview/`.

## One runtime deployment configuration

The browser fetches **`./imd-deployment.json`**, verifies canonical Keccak hashes of the ABI files it references, and creates its chain, RPC transports and wallet configuration from that file. No second escrow address/chain/ABI map is bundled.

- `deployment-handoff.json` and `network-handoff.json` are build inputs copied from the supplied handoffs. The app does **not** import them. Keep them aligned with an authorized attested handoff when rebuilding.
- `public/abi/SqueekMatchEscrow.json` is the raw implementation-derived ABI from source commit `ba6069873530d6484250b8ed574a70b0a7200068`, path `docs/abi/SqueekMatchEscrow.json`. Its canonical Keccak is `000dd3c70055e309aeaa0c7ea80a1a8e5c4e0051ac51ad85843d5b5aebdef12b`.
- `scripts/manifest.mjs` checks ABI hashes, enumerates **every** exported file except the manifest, and computes lowercase SHA-256 digests. `--check` recomputes and compares the exact manifest, including network and complete contract set. There is no poolKey in this `evm_contracts` handoff and no AMM, token swap router or liquidity flow is invented.
- `public/official/` contains the published Squeekchain ABIs and deployment snapshot, with source revision, retrieval date and original URLs in `provenance.json`. These describe external dependencies, not another application deployment. Transaction targets are resolved live from the attested escrow: `SQUEEK()`, `SQK()`, `mining()` and `mining.core()`.
- `src/config.ts` is the single integration entrypoint: runtime loader, public data/documentation URLs, chain creation, wallet connectors and phone links. Public RPCs come only from the handoff. A connected Sepolia wallet can be added as an explicit read fallback when public reads fail. Signing stays with the visitor.

There is no owner, admin initialization, fee recipient or configurable protocol setting in the escrow. No owner setup panel is applicable.

## Current safety state

The handoff records a deployment identity conflict. The worker reproduced it: the documented escrow's SQK, NFT, mining and core graph differs from the current API's token/mining/core graph. **Trading and merging correctly remain paused on the real deployment.** This is a required safety state, not a substitute deployment. Reads, address inspection, event indexing, planning and escrow cancellations/refunds remain available. An API or docs outage also fails closed. Aligning upstream identities is outside this frontend assignment; there is no bypass toggle.

The gate checks RPC chain ID, deployed escrow code, external contract code, the on-chain graph, NFT collection, SQK symbol/decimals, shipped documentation snapshot, live documentation, and exact API identities. It runs at startup, once per visible minute, and again before every approval, trade or merge. Symbols alone never establish identity.

The published external ABI supports `SqueekMining.merge(0, survivor, donor)`. The matching documented deployment supplies no Staking ABI or `mergeDeposited` method. That integration is explicitly unavailable. API staking addresses from a different deployment are never selected for transactions. Deposited Squeeks must be withdrawn before trading. API custody is supplementary and excluded on identity mismatch.

## User flows

- **My singles:** paste an address or connect; confirmed ERC-721 events discover holdings, then live `ownerOf`, `position` and `claimable` reads verify them. Counts distinguish paired-by-count and single, show cooldown/pending power, and display rewards and custody. Recent transfers can lag the 12-confirmation index; a balance comparison makes this visible.
- **Chain planner:** actual wallet counts or clearly labelled what-if input; exhaustively compares combinations of up to four purchases. Ranks more merges, fewer purchases, bonus power and known ask cost. All power/cooldown tables come from the mining contract. A path becomes separately confirmed merge-ready bids. Price and pace can be unavailable; no invented SQK/day or USD value is shown.
- **Match board:** all confirmed NFT transfer and mining merge events reconstruct holder singles; filter by level, page results and inspect a wallet. Potential partners are not sale listings. It uses browser `eth_getLogs`, IndexedDB, adaptive ranges and resumable checkpoints, without a server index.
- **Trade:** create, fill and cancel every ask/bid/swap action, my-orders and direct ID lookup. Expiry is 7 days by default, capped at 30. Maker SQK is escrowed for bids and maker-funded differences; NFTs stay in their wallets. Live fillability filters floors/best bids. Fair-value tags compare the level's active order prices, not an intrinsic valuation.
- **Buy then merge:** an ask/swap fill selects the received Squeek as a potential survivor. Preview both positions, power activation and cooldown; explicitly confirm the permanent donor burn. Claiming rewards is its own step.

Transaction review exposes each exact NFT/SQK approval and final action as separate signatures, uses exact SQK base units and token decimals, and never grants unlimited approval. Every step performs an `eth_call` simulation before opening the wallet, checks chain/account again, waits for a successful receipt and refreshes chain state. Failures stay beside the control; receipts link to the configured explorer. Cancelling after expiry refunds the maker; it is never automatic. A confirmed step is never repeated just because a display refresh failed.

## Wallets

EIP-6963 discovery lists named installed wallets. The generic connector reads “Browser wallet” and is hidden when a named extension exists. The same sheet includes Coinbase Wallet/Smart Wallet and, on phones without an extension, vendor app-browser links for MetaMask, Coinbase, Rabby and Phantom. Switching uses `wallet_switchEthereumChain`; error 4902 offers the exact `wallet_addEthereumChain` handoff and retries switching. The dialog uses native focus trapping and Escape/backdrop dismissal; pending prompts cannot be dismissed accidentally. No relay or project ID is needed.

## Validation

```sh
cd web
npm run test:install
npm test
```

Playwright starts and stops its own strict static subpath server. Tests mock every RPC/API/wallet request that could sign or spend. They **do not broadcast**. Reports and traces go to `test/scratch/` at repository root and are not delivered. Browser binaries may be installed outside the repository with `PLAYWRIGHT_BROWSERS_PATH=/tmp/squeekmatch-browsers`; use the same setting for tests.

After installing Playwright's Chromium, the pinned probe can be rerun from repository root while those pinned inputs exist:

```sh
IMD_PLAYWRIGHT="$PWD/web/node_modules/playwright/index.mjs" node .imd/reads/skills/design-critic/scripts/taste.mjs --out test/scratch/taste
```

The pinned probe input is removed by the contributor pipeline; the application build, manifest verification and included interaction tests do not depend on it. `npm run format` formats source/tests/scripts. `scripts/generate-social.mjs` optionally regenerates the included social PNG using Playwright; ordinary builds copy that PNG and need no browser.

Read [validation](../docs/frontend/VALIDATION.md), [design system](../docs/DESIGN.md), and [requirement coverage](../docs/frontend/COVERAGE.md) for exact evidence and limitations. Publication, IPFS pinning and live URL assignment happen after delivery. Open Graph paths are relative until a host is assigned.

## Delivery budget

Only `web/**`, `dist/**`, and `docs/**` are delivered. The explicit ignore-file budget is **one path: `web/.gitignore`**; it excludes nested dependency/cache/report directories under `web/`. Node modules, browser downloads, npm caches, test traces and registry archives are not submitted. A root `DESIGN.md` is forbidden by the assignment's overriding path scope, so the complete design document is delivered at `docs/DESIGN.md`.
