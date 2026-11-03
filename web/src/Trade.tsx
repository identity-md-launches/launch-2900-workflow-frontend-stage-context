import { useState } from "react";
import { useAccount } from "wagmi";
import { ArrowDownUp, ArrowRight, Plus, Search } from "lucide-react";
import { fetchJson, SOURCES } from "./config";
import { amount, errorText, positiveId, same, sqk } from "./domain";
import { approvals, escrowRead, loadOrder, marketStep, read } from "./service";
import {
  AddressLink,
  Empty,
  Field,
  IconSpin,
  Modal,
  Notice,
} from "./components";
import type {
  Context,
  Ecosystem,
  Kind,
  Order,
  Position,
  TxPlan,
  Verification,
} from "./types";
export type Review = (plan: TxPlan) => void;
export function tradingReason(
  v: Verification,
  connected: boolean,
  correctChain: boolean,
) {
  if (!connected) return "Connect a wallet to prepare a transaction.";
  if (!correctChain) return "Switch to Sepolia using the wallet control above.";
  if (!v.ok) return v.message;
  return "";
}
export type TokenPreview = {
  id: bigint;
  owner: string;
  position: Position;
  claimable: bigint | null;
  ready: boolean;
  apiNote?: string;
};
export async function inspectToken(
  ctx: Context,
  eco: Ecosystem,
  id: bigint,
): Promise<TokenPreview> {
  const [owner, position, claimable, ready] = await Promise.all([
    read<string>(ctx, eco.nft, ctx.abis.SqueekNFT, "ownerOf", [id]),
    read<Position>(ctx, eco.mining, ctx.abis.SqueekMining, "position", [0, id]),
    read<bigint>(ctx, eco.mining, ctx.abis.SqueekMining, "claimable", [
      0,
      [id],
    ]).catch(() => null),
    escrowRead<boolean>(ctx, "isMergeReady", [id]),
  ]);
  let apiNote: string;
  try {
    const api = await fetchJson<{
      status: string;
      identities?: { token?: string };
      custody?: { owner?: string; depositor?: string | null };
    }>(`${SOURCES.api}/v1/squeeks/${id}`);
    apiNote =
      same(api.identities?.token, eco.token) && api.status === "available"
        ? api.custody?.depositor
          ? "API reports a deposited Squeek. Withdraw before trading; current ownership above is read on chain."
          : "API display data matches the SQK deployment. Eligibility above is read on chain."
        : "Squeek API identities differ or data is unavailable. API metadata is excluded; these facts come from contracts.";
  } catch {
    apiNote = "Squeek API unavailable. These facts come from contracts.";
  }
  return { id, owner, position, claimable, ready, apiNote };
}
export function TokenFacts({
  token,
  eco,
}: {
  token: TokenPreview;
  eco: Ecosystem;
}) {
  const remaining =
    BigInt(token.position.nextMergeBlock) > eco.state.blockHeight
      ? BigInt(token.position.nextMergeBlock) - eco.state.blockHeight
      : 0n;
  return (
    <>
      <dl className="facts">
        <div>
          <dt>Squeek</dt>
          <dd>
            #{String(token.id)} · Level {token.position.level}
          </dd>
        </div>
        <div>
          <dt>Merge cooldown</dt>
          <dd>
            {remaining > 0n
              ? `${remaining.toLocaleString()} Squeek blocks remaining`
              : "Cooldown complete"}
          </dd>
        </div>
        <div>
          <dt>Scheduled power</dt>
          <dd>
            {token.position.pendingRound
              ? `${token.position.pendingWeight.toLocaleString()} at round ${token.position.pendingRound}`
              : "No pending change"}
          </dd>
        </div>
        <div>
          <dt>Unclaimed SQK</dt>
          <dd>
            {token.claimable === null
              ? "Unable to read; check before trading"
              : amount(token.claimable, eco.decimals) + " SQK"}
          </dd>
        </div>
      </dl>
      {token.apiNote && <p className="caption muted">{token.apiNote}</p>}
    </>
  );
}
export function Trade({
  ctx,
  verification,
  orders,
  review,
  refresh,
  onReceive,
  initialKind,
}: {
  ctx: Context;
  verification: Verification;
  orders: Order[];
  review: Review;
  refresh: () => Promise<void>;
  onReceive: (id: bigint) => void;
  initialKind?: Kind;
}) {
  const { address, isConnected, chainId } = useAccount();
  const eco = verification.ecosystem;
  const [kind, setKind] = useState<Kind>(initialKind ?? "Ask");
  const [tokenId, setTokenId] = useState("");
  const [level, setLevel] = useState("1");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("7");
  const [mergeReady, setMergeReady] = useState(true);
  const [wanted, setWanted] = useState("");
  const [difference, setDifference] = useState("0");
  const [paying, setPaying] = useState("maker");
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [lookup, setLookup] = useState("");
  const [selected, setSelected] = useState<Order>();
  const [mine, setMine] = useState(false);
  const [filter, setFilter] = useState("All");
  const reason = tradingReason(
    verification,
    isConnected,
    chainId === ctx.deployment.chainId,
  );
  async function create() {
    if (!address || !eco || reason || pending) return;
    setError("");
    setPending(true);
    try {
      const duration = Number(days);
      if (!Number.isInteger(duration) || duration < 1 || duration > 30)
        throw new Error("Choose an expiry from 1 to 30 days.");
      const requestedLevel = Number(level);
      if (
        !Number.isInteger(requestedLevel) ||
        requestedLevel < 1 ||
        requestedLevel > eco.policy.maximumLevel ||
        (kind !== "Ask" &&
          mergeReady &&
          requestedLevel >= eco.policy.maximumLevel)
      )
        throw new Error(
          "Choose a level below the merge ceiling for merge-ready orders.",
        );
      const id = kind !== "Bid" ? positiveId(tokenId) : undefined;
      let preview: TokenPreview | undefined;
      if (id) {
        preview = await inspectToken(ctx, eco, id);
        if (!same(preview.owner, address))
          throw new Error(
            "This Squeek is not held in the connected wallet. Withdraw it before trading.",
          );
        if (!checked)
          throw new Error(
            "Check the unclaimed-rewards reminder before listing.",
          );
      }
      const money =
        kind === "Swap"
          ? sqk(difference, eco.decimals, true)
          : sqk(price, eco.decimals);
      const funds =
        kind === "Bid" || (kind === "Swap" && paying === "maker") ? money : 0n;
      const steps = await approvals(ctx, eco, address, id ? [id] : [], funds);
      const durationSeconds = BigInt(duration * 86400);
      let args: readonly unknown[];
      let fn: string;
      let description: string;
      if (kind === "Ask") {
        fn = "createAsk";
        args = [id!, money, durationSeconds];
        description = `List Squeek #${id}, level ${preview!.position.level}, for ${amount(money, eco.decimals)} SQK. The NFT stays in your wallet. Expires in ${duration} days.`;
      } else if (kind === "Bid") {
        fn = "createBid";
        args = [requestedLevel, mergeReady, money, durationSeconds];
        description = `Escrow ${amount(money, eco.decimals)} SQK for one level ${requestedLevel} Squeek${mergeReady ? ", merge-ready at fill" : ""}. Anyone meeting your terms may fill. Cancel to refund unfilled escrow; expiry is ${duration} days.`;
      } else {
        fn = "createSwap";
        const target = wanted.trim()
          ? positiveId(wanted, "requested Squeek ID")
          : 0n;
        if (target === id)
          throw new Error(
            "Choose a different Squeek as your requested partner.",
          );
        args = [
          id!,
          target,
          requestedLevel,
          mergeReady,
          paying === "maker" ? money : 0n,
          paying === "taker" ? money : 0n,
          durationSeconds,
        ];
        description = `Offer #${id}, level ${preview!.position.level}, for ${target ? "#" + target : "any Squeek"} at level ${requestedLevel}. ${paying === "maker" ? "You escrow" : "The taker pays you"} ${amount(money, eco.decimals)} SQK. Expires in ${duration} days.`;
      }
      if (preview)
        description += ` Unclaimed rewards: ${preview.claimable === null ? "unavailable" : amount(preview.claimable, eco.decimals) + " SQK"}; these travel with the NFT. ${preview.position.pendingRound ? "A power change is pending." : "No pending power change."} Merge-ready: ${preview.ready ? "yes" : "no"}.`;
      steps.push(
        marketStep(ctx, fn, args, `Create ${kind.toLowerCase()}`, description),
      );
      review({ title: `Review ${kind.toLowerCase()}`, description, steps });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  async function lookupOrder() {
    setError("");
    setPending(true);
    try {
      setSelected(await loadOrder(ctx, positiveId(lookup, "order ID")));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  const filtered = orders.filter(
    (o) =>
      (!mine || same(o.maker, address)) &&
      (filter === "All" || o.kind === filter),
  );
  return (
    <div className="stack-large">
      <section className="surface form-surface">
        <div className="section-head">
          <h2>Create an order</h2>
          <span className="tag">0% market fee</span>
        </div>
        <div className="segmented" aria-label="Order kind">
          {(["Ask", "Bid", "Swap"] as Kind[]).map((k) => (
            <button
              type="button"
              aria-pressed={kind === k}
              key={k}
              onClick={() => {
                setKind(k);
                setError("");
              }}
            >
              {k === "Ask"
                ? "Sell a Squeek"
                : k === "Bid"
                  ? "Bid for a level"
                  : "Swap Squeeks"}
            </button>
          ))}
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <div className="form-grid">
            {kind !== "Bid" && (
              <Field label="Your Squeek ID" hint="Wallet-held Squeeks only.">
                <input
                  value={tokenId}
                  onChange={(e) => {
                    setTokenId(e.target.value);
                    setChecked(false);
                  }}
                  inputMode="numeric"
                  placeholder="e.g. 42"
                  required
                />
              </Field>
            )}
            {kind !== "Ask" && (
              <Field label="Wanted level">
                <select
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  {Array.from(
                    { length: eco?.policy.maximumLevel ?? 10 },
                    (_, i) => (
                      <option key={i + 1} value={i + 1}>
                        Level {i + 1}
                      </option>
                    ),
                  )}
                </select>
              </Field>
            )}
            {kind !== "Swap" && (
              <Field
                label={
                  kind === "Ask" ? "Asking price · SQK" : "Bid amount · SQK"
                }
              >
                <input
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                />
              </Field>
            )}
            {kind === "Swap" && (
              <>
                <Field
                  label="Requested Squeek ID (optional)"
                  hint="Leave empty for any Squeek at the wanted level."
                >
                  <input
                    value={wanted}
                    onChange={(e) => setWanted(e.target.value)}
                    inputMode="numeric"
                    placeholder="Any matching Squeek"
                  />
                </Field>
                <Field label="SQK difference">
                  <input
                    value={difference}
                    onChange={(e) => setDifference(e.target.value)}
                    inputMode="decimal"
                    required
                  />
                </Field>
                <Field label="Who adds SQK?">
                  <select
                    value={paying}
                    onChange={(e) => setPaying(e.target.value)}
                  >
                    <option value="maker">I add SQK (escrowed)</option>
                    <option value="taker">The taker adds SQK</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="Expiry · days" hint="7 by default. Maximum 30.">
              <input
                value={days}
                onChange={(e) => setDays(e.target.value)}
                type="number"
                min="1"
                max="30"
                required
              />
            </Field>
          </div>
          {kind !== "Ask" && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={mergeReady}
                onChange={(e) => setMergeReady(e.target.checked)}
              />
              Require merge-ready at fill
            </label>
          )}
          {kind !== "Bid" && (
            <label className="checkbox">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
              />
              I’ve checked unclaimed SQK. Rewards travel with the Squeek; I
              should claim first.
            </label>
          )}
          <p className="caption muted">
            {kind === "Ask"
              ? "The Squeek remains in your wallet until sold. Merging or moving it may invalidate your listing; cancel unwanted orders."
              : kind === "Bid"
                ? "Your bid escrows SQK. Expiry does not refund automatically: cancel the order to release the funds."
                : "Only one side can add SQK. Your Squeek stays in your wallet; any SQK you add is held in escrow."}{" "}
            Gas is separate. USD pricing is unavailable.
          </p>
          {reason && <Notice tone="warn">{reason}</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
          <button
            type="submit"
            className="primary"
            disabled={!!reason || !eco || pending}
          >
            {pending ? <IconSpin /> : <Plus size={18} />}Review{" "}
            {kind.toLowerCase()}
          </button>
        </form>
      </section>
      <section className="surface">
        <div className="section-head">
          <h2>Orders</h2>
          <button type="button" onClick={() => void refresh()}>
            Refresh orders
          </button>
        </div>
        <div className="toolbar">
          <Field label="Order type">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {["All", "Ask", "Bid", "Swap"].map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </Field>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
              disabled={!address}
            />
            My orders
          </label>
        </div>
        <form
          className="lookup"
          onSubmit={(e) => {
            e.preventDefault();
            void lookupOrder();
          }}
        >
          <label className="sr-only" htmlFor="order-lookup">
            Order ID
          </label>
          <input
            id="order-lookup"
            value={lookup}
            onChange={(e) => setLookup(e.target.value)}
            inputMode="numeric"
            placeholder="Look up an order ID"
            required
          />
          <button type="submit" disabled={pending}>
            <Search size={16} />
            Look up
          </button>
        </form>
        {filtered.length ? (
          <div className="order-list">
            {filtered
              .slice()
              .reverse()
              .map((order) => (
                <OrderRow
                  key={String(order.id)}
                  order={order}
                  onSelect={() => setSelected(order)}
                  allOrders={orders}
                />
              ))}
          </div>
        ) : (
          <Empty
            title={mine ? "No orders from this wallet" : "No orders to show"}
          >
            <p>
              {mine
                ? "Create an ask, bid or swap above."
                : "Refresh the on-chain index or create the first order."}
            </p>
          </Empty>
        )}
      </section>
      {selected && (
        <OrderDetail
          ctx={ctx}
          verification={verification}
          order={selected}
          review={review}
          close={() => setSelected(undefined)}
          onReceive={onReceive}
        />
      )}
    </div>
  );
}
export function fairValue(order: Order, all: Order[]) {
  if (order.kind === "Swap") return "Negotiated difference";
  const active = all.filter(
    (o) =>
      o.kind === order.kind &&
      o.level === order.level &&
      o.fillable &&
      o.status === 1,
  );
  if (!active.length) return "No active comparison";
  if (active.length === 1) return "Only price at this level";
  const prices = active.map((o) => o.amount).sort((a, b) => (a < b ? -1 : 1));
  const median = prices[Math.floor(prices.length / 2)];
  if (order.amount === (order.kind === "Ask" ? prices[0] : prices.at(-1)))
    return order.kind === "Ask" ? "Floor ask" : "Best bid";
  return order.amount <= median ? "At or below median" : "Above median";
}
export function OrderRow({
  order: o,
  onSelect,
  allOrders,
}: {
  order: Order;
  onSelect: () => void;
  allOrders: Order[];
}) {
  const expired = BigInt(Math.floor(Date.now() / 1000)) >= o.expiresAt;
  return (
    <article className="order-row">
      <span className="level-icon">L{o.level}</span>
      <div className="order-description">
        <strong>
          {o.kind} #{String(o.id)}
          {o.tokenId ? ` · Squeek #${o.tokenId}` : ""}
        </strong>
        <div className="caption muted">
          {o.status === 2
            ? "Filled"
            : o.status === 3
              ? "Cancelled"
              : expired
                ? "Expired; cancel to refund"
                : !o.fillable
                  ? "Not fillable; cancel stale order"
                  : o.mergeReady
                    ? "Merge-ready required"
                    : "Any matching cooldown"}{" "}
          · {fairValue(o, allOrders)}
        </div>
      </div>
      <div className="order-price">
        <strong>{amount(o.amount)} SQK</strong>
        {o.kind === "Swap" && (
          <span className="caption muted">
            Taker adds {amount(o.fromTaker)} SQK
          </span>
        )}
      </div>
      <button type="button" onClick={onSelect}>
        View order
        <ArrowRight size={16} />
      </button>
    </article>
  );
}
export function OrderDetail({
  ctx,
  verification,
  order,
  review,
  close,
  onReceive,
}: {
  ctx: Context;
  verification: Verification;
  order: Order;
  review: Review;
  close: () => void;
  onReceive: (id: bigint) => void;
}) {
  const { address, isConnected, chainId } = useAccount();
  const eco = verification.ecosystem;
  const [id, setId] = useState("");
  const [preview, setPreview] = useState<TokenPreview>();
  const [offered, setOffered] = useState<TokenPreview>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [ack, setAck] = useState(false);
  const [inspected, setInspected] = useState(false);
  const reason = tradingReason(
    verification,
    isConnected,
    chainId === ctx.deployment.chainId,
  );
  const maker = same(address, order.maker);
  const expired = BigInt(Math.floor(Date.now() / 1000)) >= order.expiresAt;
  const cancellable = order.status === 1 && (maker || expired);
  const canFill = order.fillable && !maker && order.status === 1 && !expired;
  async function inspect() {
    if (!eco || pending) return;
    setError("");
    setPending(true);
    setInspected(false);
    try {
      if (order.tokenId)
        setPreview(await inspectToken(ctx, eco, order.tokenId));
      if (order.kind !== "Ask")
        setOffered(await inspectToken(ctx, eco, positiveId(id)));
      setInspected(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  async function fill() {
    if (!eco || !address || reason || pending) return;
    setError("");
    setPending(true);
    try {
      if (!inspected)
        throw new Error(
          "Check the live Squeek details before reviewing the trade.",
        );
      const live = await loadOrder(ctx, order.id);
      if (!live.fillable || live.status !== 1)
        throw new Error(
          "This order is no longer fillable. Refresh the orders.",
        );
      const offeredId = live.kind !== "Ask" ? positiveId(id) : undefined;
      const funds =
        live.kind === "Ask"
          ? live.amount
          : live.kind === "Swap"
            ? live.fromTaker
            : 0n;
      const steps = await approvals(
        ctx,
        eco,
        address,
        offeredId ? [offeredId] : [],
        funds,
      );
      if (offeredId && !ack)
        throw new Error(
          "Check the rewards reminder before selling or swapping.",
        );
      const verb =
        live.kind === "Ask"
          ? "Buy Squeek"
          : live.kind === "Bid"
            ? "Sell into bid"
            : "Swap Squeeks";
      const description =
        live.kind === "Ask"
          ? `Pay ${amount(live.amount, eco.decimals)} SQK to receive Squeek #${live.tokenId}. Cooldown and pending power are shown above. The seller may claim rewards before the fill; unclaimed SQK is not guaranteed.`
          : live.kind === "Bid"
            ? `Send your Squeek #${offeredId} to the bidder and receive ${amount(live.amount, eco.decimals)} escrowed SQK.`
            : `Send #${offeredId} and ${amount(live.fromTaker, eco.decimals)} SQK. Receive #${live.tokenId} and ${amount(live.amount, eco.decimals)} SQK.`;
      steps.push(
        marketStep(
          ctx,
          `fill${live.kind}`,
          offeredId ? [live.id, offeredId] : [live.id],
          verb,
          description,
        ),
      );
      close();
      review({
        title: verb,
        description,
        steps,
        receivedToken: live.tokenId,
        onSuccess: () => {
          if (live.kind !== "Bid" && live.tokenId) onReceive(live.tokenId);
        },
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  async function cancel() {
    if (!address || chainId !== ctx.deployment.chainId || pending) return;
    setPending(true);
    setError("");
    try {
      const live = await loadOrder(ctx, order.id);
      if (live.status !== 1)
        throw new Error("This order has already closed. Refresh the board.");
      const description = `Cancel ${live.kind.toLowerCase()} #${live.id}. ${live.amount > 0n && live.kind !== "Ask" ? `${amount(live.amount)} SQK is refunded to the maker, ${live.maker}.` : "No escrowed SQK is held for this order."} You pay only Sepolia gas.`;
      close();
      review({
        title: "Cancel order",
        description,
        requiresIdentity: false,
        steps: [
          marketStep(
            ctx,
            `cancel${live.kind}`,
            [live.id],
            "Cancel order",
            description,
          ),
        ],
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Modal title={`${order.kind} #${order.id}`} onClose={close} busy={pending}>
      <div className="stack">
        <dl className="facts">
          <div>
            <dt>Maker</dt>
            <dd>
              <AddressLink address={order.maker} ctx={ctx} />
            </dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd>
              {order.level}
              {order.mergeReady ? " · Merge-ready required" : ""}
            </dd>
          </div>
          <div>
            <dt>{order.kind === "Swap" ? "Maker adds" : "Price"}</dt>
            <dd>{amount(order.amount)} SQK</dd>
          </div>
          {order.kind === "Swap" && (
            <div>
              <dt>Taker adds</dt>
              <dd>
                {amount(order.fromTaker)} SQK ·{" "}
                {order.wantedTokenId
                  ? `Squeek #${order.wantedTokenId}`
                  : "Any matching Squeek"}
              </dd>
            </div>
          )}
          <div>
            <dt>Expiry</dt>
            <dd>{new Date(Number(order.expiresAt) * 1000).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              {order.status === 2
                ? "Filled"
                : order.status === 3
                  ? "Cancelled"
                  : expired
                    ? "Expired"
                    : order.fillable
                      ? "Fillable"
                      : "Not fillable"}
            </dd>
          </div>
        </dl>
        {canFill && (
          <>
            {order.kind !== "Ask" && (
              <Field label="Squeek ID you offer">
                <input
                  inputMode="numeric"
                  value={id}
                  onChange={(e) => {
                    setId(e.target.value);
                    setInspected(false);
                    setOffered(undefined);
                  }}
                  placeholder="Your matching Squeek ID"
                />
              </Field>
            )}
            <button
              type="button"
              disabled={pending || !eco}
              onClick={() => void inspect()}
            >
              {pending && <IconSpin />}Check live Squeek details
            </button>
            {preview && eco && (
              <div>
                <h3>You receive</h3>
                <TokenFacts token={preview} eco={eco} />
              </div>
            )}
            {offered && eco && (
              <div>
                <h3>You give</h3>
                <TokenFacts token={offered} eco={eco} />
              </div>
            )}
            {order.kind !== "Ask" && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                />
                I’ve checked rewards and understand unclaimed SQK travels with
                my Squeek.
              </label>
            )}
            {reason && <Notice tone="warn">{reason}</Notice>}
            <button
              type="button"
              className="primary"
              disabled={!!reason || pending || !inspected}
              onClick={() => void fill()}
            >
              <ArrowDownUp size={18} />
              Review trade
            </button>
          </>
        )}
        {cancellable && (
          <>
            <p className="caption muted">
              Cancellation remains available during an identity mismatch. Any
              escrowed SQK always returns to the maker.
            </p>
            <button
              type="button"
              disabled={
                !isConnected || chainId !== ctx.deployment.chainId || pending
              }
              onClick={() => void cancel()}
            >
              Cancel {order.kind.toLowerCase()}
              {order.kind !== "Ask" ? " and refund" : ""}
            </button>
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </div>
    </Modal>
  );
}
