import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  ArrowRight,
  ArrowUpRight,
  CircleHelp,
  GitMerge,
  LayoutGrid,
  ListFilter,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Sprout,
} from "lucide-react";
import { amount, addressValue, errorText, same } from "./domain";
import {
  derivePace,
  fillsLabel,
  loadOrders,
  loadWallet,
  read,
  supplementary,
  verifyIdentity,
} from "./service";
import { SOURCES } from "./config";
import { clearIndexCache } from "./indexer";
import WalletControl from "./Wallet";
import TransactionReview from "./Transactions";
import Singles from "./Singles";
import Planner from "./Planner";
import Board from "./Board";
import Merge from "./Merge";
import { OrderDetail, Trade } from "./Trade";
import { AddressLink, IconSpin, Notice } from "./components";
import type {
  ApiData,
  Context,
  IndexedEvent,
  Order,
  Squeek,
  TxPlan,
  Verification,
} from "./types";
const pages = [
  { id: "singles", name: "My singles", icon: LayoutGrid },
  { id: "planner", name: "Chain planner", icon: GitMerge },
  { id: "board", name: "Match board", icon: Sprout },
  { id: "trade", name: "Trade", icon: ListFilter },
  { id: "merge", name: "Merge", icon: GitMerge },
];
const titles: Record<string, { title: string; description: string }> = {
  singles: {
    title: "My singles",
    description: "Find the missing match for your next merge.",
  },
  planner: {
    title: "Chain planner",
    description: "One smart purchase can start a whole chain.",
  },
  board: {
    title: "Match board",
    description: "A partner for every level, found on chain.",
  },
  trade: {
    title: "Trade Squeeks, peer to peer.",
    description: "Asks, bids and swaps. SQK goes where you agree.",
  },
  merge: {
    title: "Two Squeeks. One stronger.",
    description: "Preview the power. Choose the survivor.",
  },
};
function currentPage() {
  const id = location.hash.slice(1);
  return pages.some((p) => p.id === id) ? id : "singles";
}
export default function App({ ctx }: { ctx: Context }) {
  const { address, isConnected, chainId, connector } = useAccount();
  const [page, setPage] = useState(currentPage);
  const [verification, setVerification] = useState<Verification>({
    ok: false,
    status: "checking",
    message: "Checking Sepolia contracts and Squeekchain identities…",
    rows: [],
  });
  const [api, setApi] = useState<ApiData>({});
  const [plan, setPlan] = useState<TxPlan>();
  const [received, setReceived] = useState<bigint>();
  const [tokens, setTokens] = useState<Squeek[] | null>(null);
  const [scanAddress, setScanAddress] = useState("");
  const [inspected, setInspected] = useState<string>();
  const [scanPending, setScanPending] = useState(false);
  const [scanProgress, setScanProgress] = useState("");
  const [scanError, setScanError] = useState("");
  const [through, setThrough] = useState<bigint>();
  const [note, setNote] = useState<string>();
  const [orders, setOrders] = useState<Order[]>([]);
  const [fills, setFills] = useState<IndexedEvent[]>([]);
  const [orderError, setOrderError] = useState("");
  const [orderProgress, setOrderProgress] = useState("");
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderLoaded, setOrderLoaded] = useState(false);
  const [marketOrder, setMarketOrder] = useState<Order>();
  const [balance, setBalance] = useState<bigint>();
  const [nativeBalance, setNativeBalance] = useState<bigint>();
  const [balanceError, setBalanceError] = useState("");
  const [checking, setChecking] = useState(false);
  const [cacheMessage, setCacheMessage] = useState("");
  const scanController = useRef<AbortController | undefined>(undefined);
  const verifyLock = useRef(false);
  const orderLock = useRef(false);
  const autoWallet = useRef("");
  const eco = verification.ecosystem;
  const verify = useCallback(async () => {
    if (verifyLock.current) return;
    verifyLock.current = true;
    setChecking(true);
    try {
      setVerification(await verifyIdentity(ctx));
    } finally {
      setChecking(false);
      verifyLock.current = false;
    }
  }, [ctx]);
  const refreshOrders = useCallback(async () => {
    if (orderLock.current) return;
    orderLock.current = true;
    setOrderLoading(true);
    setOrderError("");
    try {
      const result = await loadOrders(ctx, setOrderProgress);
      setOrders(result.orders);
      setFills(result.fills);
      setOrderLoaded(true);
    } catch (e) {
      setOrderError(errorText(e));
    } finally {
      setOrderLoading(false);
      setOrderProgress("");
      orderLock.current = false;
    }
  }, [ctx]);
  const refreshBalances = useCallback(async () => {
    setBalance(undefined);
    setNativeBalance(undefined);
    setBalanceError("");
    if (!address || !eco) return;
    try {
      const [sqkBalance, native] = await Promise.all([
        read<bigint>(ctx, eco.token, ctx.abis.SqueekToken, "balanceOf", [
          address,
        ]),
        ctx.client.getBalance({ address }),
      ]);
      setBalance(sqkBalance);
      setNativeBalance(native);
    } catch (e) {
      setBalanceError(errorText(e));
    }
  }, [ctx, address, eco?.token]);
  async function scan(value: string) {
    let owner: ReturnType<typeof addressValue>;
    try {
      owner = addressValue(value);
    } catch (e) {
      setScanError(errorText(e));
      return;
    }
    if (!eco) {
      setScanError("Wait for the Squeek contracts to load, then try again.");
      return;
    }
    scanController.current?.abort();
    const controller = new AbortController();
    scanController.current = controller;
    setScanPending(true);
    setScanError("");
    setScanAddress(owner);
    setTokens(null);
    setInspected(undefined);
    setNote(undefined);
    try {
      const result = await loadWallet(
        ctx,
        eco,
        owner,
        setScanProgress,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setTokens(result.tokens);
      setInspected(owner);
      setThrough(result.through);
      setNote(result.apiNote);
    } catch (e) {
      if (!controller.signal.aborted) setScanError(errorText(e));
    } finally {
      if (!controller.signal.aborted) {
        setScanPending(false);
        setScanProgress("");
      }
    }
  }
  async function refresh() {
    await Promise.all([refreshOrders(), refreshBalances()]);
    if (inspected) await scan(inspected);
  }
  function onReceive(id: bigint) {
    setReceived(id);
    location.hash = "merge";
  }
  const apiToken = (api.economy?.identities as { token?: string } | undefined)
    ?.token;
  const pace = eco && same(apiToken, eco.token) ? derivePace(api) : null;
  useEffect(() => {
    const update = () => {
      setPage(currentPage());
      setScanError("");
    };
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    void verify();
    void supplementary().then(setApi);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void verify();
    }, 60000);
    return () => {
      clearInterval(timer);
      scanController.current?.abort();
    };
  }, [verify]);
  useEffect(() => {
    if (eco && !orderLoaded && !orderLoading && !orderError)
      void refreshOrders();
  }, [eco, orderLoaded, orderLoading, orderError, refreshOrders]);
  useEffect(() => {
    void refreshBalances();
  }, [refreshBalances]);
  useEffect(() => {
    if (address && eco && autoWallet.current !== address) {
      autoWallet.current = address;
      void scan(address);
    }
    if (!address) autoWallet.current = "";
  }, [address, eco?.nft]);
  // Public RPCs are primary. A connected Sepolia provider is offered as a read fallback only on request.
  async function walletReadFallback() {
    if (!connector || chainId !== ctx.deployment.chainId) return;
    try {
      const { createPublicClient, custom, fallback, http } =
        await import("viem");
      const { makeChain } = await import("./config");
      const provider = await connector.getProvider();
      ctx.client = createPublicClient({
        chain: makeChain(ctx.deployment),
        transport: fallback(
          [
            ...ctx.deployment.network.rpcUrls.map((url) =>
              http(url, { timeout: 5000, retryCount: 0 }),
            ),
            custom(provider as Parameters<typeof custom>[0]),
          ],
          { rank: false, retryCount: 0 },
        ),
      });
      await verify();
    } catch (e) {
      setScanError(errorText(e));
    }
  }
  const activeOrders = orders.filter(
    (o) =>
      o.status === 1 &&
      o.fillable &&
      o.expiresAt > BigInt(Math.floor(Date.now() / 1000)),
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="testnet-strip">
        <span className="status-dot" />
        Sepolia testnet{" "}
        <span className="strip-secondary">· Test SQK only. No real value.</span>
        <a
          href={ctx.deployment.network.faucets[0]}
          target="_blank"
          rel="noreferrer"
        >
          Get test ETH
          <ArrowUpRight size={13} />
        </a>
      </div>
      <div className="app-shell">
        <header className="app-header">
          <a href="#singles" className="brand" aria-label="SqueekMatch home">
            <img src="./favicon.svg" width="38" height="38" alt="" />
            <span>
              Squeek<span className="brand-light">Match</span>
            </span>
          </a>
          <WalletControl ctx={ctx} />
        </header>
        <nav aria-label="Main navigation" className="main-nav">
          {pages.map((p) => (
            <a
              key={p.id}
              href={`#${p.id}`}
              aria-current={page === p.id ? "page" : undefined}
            >
              <p.icon size={17} aria-hidden="true" />
              {p.name}
            </a>
          ))}
        </nav>
        <main id="main" tabIndex={-1}>
          <div className="page-heading">
            <div>
              <h1>{titles[page].title}</h1>
              <p>{titles[page].description}</p>
            </div>
            <a
              href={SOURCES.docs + "/squeeks/merge/"}
              target="_blank"
              rel="noreferrer"
              className="help-link"
            >
              <CircleHelp size={17} />
              How merging works
              <ArrowUpRight size={14} />
            </a>
          </div>
          <div className="workspace">
            <div className="primary-column">
              {page === "singles" && (
                <Singles
                  key={scanAddress || "empty-wallet"}
                  ctx={ctx}
                  verification={verification}
                  tokens={tokens}
                  scan={(value) => void scan(value)}
                  scanAddress={scanAddress}
                  inspected={inspected}
                  pending={scanPending}
                  progress={scanProgress}
                  scanError={scanError}
                  through={through}
                  note={note}
                  pace={pace}
                />
              )}
              {page === "planner" && (
                <Planner
                  ctx={ctx}
                  verification={verification}
                  tokens={tokens}
                  orders={orders}
                  review={setPlan}
                  pace={pace}
                />
              )}
              {page === "board" && (
                <Board
                  ctx={ctx}
                  verification={verification}
                  inspect={(value) => {
                    location.hash = "singles";
                    void scan(value);
                  }}
                />
              )}
              {page === "trade" && (
                <Trade
                  ctx={ctx}
                  verification={verification}
                  orders={orders}
                  review={setPlan}
                  refresh={refreshOrders}
                  onReceive={onReceive}
                />
              )}
              {page === "merge" && (
                <Merge
                  key={String(received ?? "merge")}
                  ctx={ctx}
                  verification={verification}
                  tokens={tokens}
                  review={setPlan}
                  received={received}
                />
              )}
            </div>
            <aside className="sidebar" aria-label="Market and verification">
              <section className="surface market-pulse">
                <div className="section-head">
                  <h2>Market pulse</h2>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="Refresh market"
                    disabled={orderLoading}
                    onClick={() => void refreshOrders()}
                  >
                    {orderLoading ? <IconSpin /> : <RefreshCw size={17} />}
                  </button>
                </div>
                <p className="caption muted">Fillable orders only · SQK</p>
                {orderLoaded ? (
                  <>
                    <details
                      className="market-prices"
                      open={activeOrders.length > 0}
                    >
                      <summary>
                        {activeOrders.length
                          ? "Prices by level"
                          : "No open orders · View all levels"}
                      </summary>
                      <table className="market-table">
                        <thead>
                          <tr>
                            <th scope="col">Level</th>
                            <th scope="col">Floor ask</th>
                            <th scope="col">Best bid</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from(
                            { length: eco?.policy.maximumLevel ?? 10 },
                            (_, i) => {
                              const asks = activeOrders
                                .filter(
                                  (o) => o.kind === "Ask" && o.level === i + 1,
                                )
                                .sort((a, b) => (a.amount < b.amount ? -1 : 1));
                              const bids = activeOrders
                                .filter(
                                  (o) => o.kind === "Bid" && o.level === i + 1,
                                )
                                .sort((a, b) => (a.amount > b.amount ? -1 : 1));
                              return (
                                <tr key={i}>
                                  <th scope="row">L{i + 1}</th>
                                  <td>
                                    {asks[0] ? (
                                      <button
                                        type="button"
                                        onClick={() => setMarketOrder(asks[0])}
                                      >
                                        {amount(asks[0].amount, eco?.decimals)}
                                      </button>
                                    ) : (
                                      <span className="muted">None</span>
                                    )}
                                  </td>
                                  <td>
                                    {bids[0] ? (
                                      <button
                                        type="button"
                                        onClick={() => setMarketOrder(bids[0])}
                                      >
                                        {amount(bids[0].amount, eco?.decimals)}
                                      </button>
                                    ) : (
                                      <span className="muted">None</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            },
                          )}
                        </tbody>
                      </table>
                    </details>
                    <a className="inline" href="#trade">
                      {activeOrders.length} live orders
                      <ArrowRight size={16} />
                    </a>
                  </>
                ) : (
                  <p className="caption muted">
                    {orderLoading
                      ? orderProgress || "Reading the order book…"
                      : "Order book not loaded."}
                  </p>
                )}
                {orderError && (
                  <Notice tone="error">
                    {orderError} Use Refresh market to try again.
                  </Notice>
                )}
              </section>
              <section
                className={`verification-panel ${verification.ok ? "verified" : ""}`}
              >
                <div className="section-head">
                  <h2>Before you sign</h2>
                  {verification.ok ? (
                    <ShieldCheck size={22} />
                  ) : (
                    <ShieldX size={22} />
                  )}
                </div>
                <p
                  className={`verification-state ${verification.ok ? "ok" : ""}`}
                >
                  {verification.status === "checking"
                    ? "Checking identities"
                    : verification.ok
                      ? "Identity checks passed"
                      : "Trading paused"}
                </p>
                <p className="caption">{verification.message}</p>
                <details>
                  <summary>View contract checks</summary>
                  <div className="identity-list">
                    {verification.rows.map((r, i) => (
                      <div className="identity-row" key={i}>
                        <strong className="caption">
                          {r.ok ? "✓" : "!"} {r.label}
                        </strong>
                        <span className="caption">
                          Expected: <bdi>{r.expected ?? "Unavailable"}</bdi>
                        </span>
                        <span className="caption">
                          Observed: <bdi>{r.actual ?? "Unavailable"}</bdi>
                        </span>
                      </div>
                    ))}
                    {!verification.rows.length && (
                      <p className="caption">Checks are still loading.</p>
                    )}
                  </div>
                  <p className="caption muted">
                    Snapshot retrieved {ctx.provenance.retrievedAt}. Live docs
                    and API are rechecked before every trade, approval or merge.
                  </p>
                </details>
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void verify()}
                >
                  {checking ? <IconSpin /> : <RefreshCw size={16} />}Retry
                  identity check
                </button>
                {isConnected && chainId === ctx.deployment.chainId && !eco && (
                  <button
                    type="button"
                    onClick={() => void walletReadFallback()}
                  >
                    Use wallet RPC fallback
                  </button>
                )}
                {verification.checkedAt && (
                  <p className="caption muted">
                    Checked{" "}
                    {new Date(verification.checkedAt).toLocaleTimeString()}
                  </p>
                )}
              </section>
              {address && (
                <section className="surface wallet-balance">
                  <h2>Connected balance</h2>
                  <AddressLink address={address} ctx={ctx} />
                  <p className="balance-number">
                    {balance === undefined
                      ? "Loading…"
                      : amount(balance, eco?.decimals) + " SQK"}
                  </p>
                  <p className="caption muted">
                    {nativeBalance !== undefined
                      ? amount(nativeBalance) + " Sepolia ETH for gas"
                      : "Reading gas balance…"}{" "}
                    · USD value unavailable
                  </p>
                  {balanceError && <Notice tone="error">{balanceError}</Notice>}
                </section>
              )}
              <section className="market-activity">
                <h2>Last fills</h2>
                {fills.length ? (
                  <ul>
                    {fills.map((f) => (
                      <li key={`${f.tx}-${f.logIndex}`}>
                        <a
                          href={`${ctx.deployment.network.explorer}/tx/${f.tx}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {fillsLabel(f)}
                          <ArrowUpRight size={14} />
                        </a>
                        <span className="caption muted">
                          Block {BigInt(f.block).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="caption muted">
                    {orderLoaded
                      ? "No fills in the confirmed escrow history."
                      : "Load the market to see confirmed fills."}
                  </p>
                )}
              </section>
            </aside>
          </div>
          <section className="how-it-works">
            <div>
              <span className="number">1</span>
              <h2>Find a single</h2>
              <p>See which levels need a partner.</p>
            </div>
            <div>
              <span className="number">2</span>
              <h2>Make a match</h2>
              <p>Agree on an ask, bid or swap.</p>
            </div>
            <div>
              <span className="number">3</span>
              <h2>Merge for more</h2>
              <p>Keep one Squeek. Unlock more power.</p>
            </div>
          </section>
          <section className="deployment-details">
            <details>
              <summary>Deployment, data & safety</summary>
              <div className="stack">
                <p className="caption">
                  Fan-made and unofficial. No market fee, owner or proxy. SQK
                  bids and maker-funded swaps are held in escrow; NFTs stay in
                  their wallets until a fill. Orders can expire; cancelling
                  releases escrowed SQK. Never transfer funds directly to the
                  escrow.
                </p>
                <AddressLink
                  ctx={ctx}
                  address={ctx.escrow.address}
                  full
                  label="SqueekMatchEscrow"
                />
                {eco &&
                  [
                    ["SqueekNFT", eco.nft],
                    ["SqueekToken", eco.token],
                    ["SqueekMining", eco.mining],
                    ["SqueekCore", eco.core],
                  ].map(([name, a]) => (
                    <div key={name}>
                      <span className="caption">{name}</span>
                      <AddressLink ctx={ctx} address={a} full label={name} />
                    </div>
                  ))}
                <p className="caption break">
                  Attested source: {ctx.deployment.sourceCommit}
                  <br />
                  Attestation: {ctx.deployment.attestationHash}
                </p>
                <div className="toolbar">
                  <a href="./imd-deployment.json">
                    Runtime deployment manifest
                  </a>
                  <a href={`./${ctx.escrow.abiPath}`}>Attested escrow ABI</a>
                  <a
                    href={SOURCES.deployments}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Official deployment reference
                  </a>
                </div>
                <p className="caption">
                  API data is display-only. If identities disagree or a required
                  source is unavailable, trading stays paused. Cached logs are
                  12 confirmations behind; ownership and eligibility are
                  rechecked live. Clear the local event cache to rescan a
                  suspected indexing problem.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    void clearIndexCache().then(() =>
                      setCacheMessage(
                        "Local event cache cleared. Refresh the market or scan a wallet to rebuild it.",
                      ),
                    )
                  }
                >
                  Clear local event cache
                </button>
                <p className="caption" role="status">
                  {cacheMessage}
                </p>
                {api.error && <p className="caption muted">{api.error}</p>}
                <p className="caption muted">
                  Hamster pace:{" "}
                  {pace
                    ? `${pace.toFixed(0)} Squeek blocks/day, observed from API settlements`
                    : "Unavailable for the attested deployment"}
                  . The hamster can rest; cooldown time is an estimate.
                </p>
              </div>
            </details>
          </section>
        </main>
        <footer>
          <span className="inline">
            <img src="./favicon.svg" alt="" width="22" height="22" />
            SqueekMatch <span className="muted">· Unofficial, on purpose.</span>
          </span>
          <div>
            <a href={SOURCES.docs} target="_blank" rel="noreferrer">
              Squeekchain docs
              <ArrowUpRight size={14} />
            </a>
            <a
              href="https://github.com/identity-md-launches/launch-2897-workflow-contract-stage-context"
              target="_blank"
              rel="noreferrer"
            >
              Source
              <ArrowUpRight size={14} />
            </a>
          </div>
        </footer>
      </div>
      {plan && (
        <TransactionReview
          ctx={ctx}
          plan={plan}
          close={() => setPlan(undefined)}
          refresh={refresh}
          onVerify={setVerification}
        />
      )}
      {marketOrder && (
        <OrderDetail
          ctx={ctx}
          verification={verification}
          order={marketOrder}
          review={setPlan}
          close={() => setMarketOrder(undefined)}
          onReceive={onReceive}
        />
      )}
    </>
  );
}
