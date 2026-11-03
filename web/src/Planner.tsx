import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { ArrowRight, GitMerge, ShoppingBasket } from "lucide-react";
import { amount, errorText, planChains, sqk, type Plan } from "./domain";
import { approvals, marketStep } from "./service";
import { Empty, Field, IconSpin, Modal, Notice } from "./components";
import { tradingReason, type Review } from "./Trade";
import type { Context, Order, Squeek, Verification } from "./types";
export default function Planner({
  ctx,
  verification,
  tokens,
  orders,
  review,
  pace,
}: {
  ctx: Context;
  verification: Verification;
  tokens: Squeek[] | null;
  orders: Order[];
  review: Review;
  pace: number | null;
}) {
  const { address, isConnected, chainId } = useAccount();
  const eco = verification.ecosystem;
  const [manual, setManual] = useState(false);
  const [counts, setCounts] = useState<number[]>(Array(10).fill(0));
  const [max, setMax] = useState("1");
  const [chosen, setChosen] = useState<Plan>();
  const [bids, setBids] = useState<Record<number, string>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const reason = tradingReason(
    verification,
    isConnected,
    chainId === ctx.deployment.chainId,
  );
  const inventory = manual
    ? counts
    : Array.from(
        { length: eco?.policy.maximumLevel ?? 10 },
        (_, i) =>
          (tokens ?? []).filter(
            (t) => t.position.level === i + 1 && !t.deposited,
          ).length,
      );
  const prices = Array.from(
    { length: eco?.policy.maximumLevel ?? 10 },
    (_, i) => {
      const values = orders
        .filter((o) => o.kind === "Ask" && o.level === i + 1 && o.fillable)
        .map((o) => o.amount);
      return values.length ? values.reduce((a, b) => (a < b ? a : b)) : null;
    },
  );
  const plans = useMemo(
    () => (eco ? planChains(inventory, eco.policy, prices, Number(max)) : []),
    [eco, inventory.join(","), prices.map(String).join(","), max],
  );
  function choose(plan: Plan) {
    setError("");
    setChosen(plan);
    setBids(
      Object.fromEntries(
        plan.buys.map((n, i) => [
          i,
          n && prices[i] !== null
            ? formatUnits(prices[i]!, eco?.decimals ?? 18)
            : "",
        ]),
      ),
    );
  }
  async function queue() {
    if (!chosen || !eco || !address || reason || pending) return;
    setError("");
    setPending(true);
    try {
      let total = 0n;
      const requests: { level: number; price: bigint }[] = [];
      chosen.buys.forEach((n, i) => {
        if (n) {
          const p = sqk(bids[i] ?? "", eco.decimals);
          for (let c = 0; c < n; c++) {
            total += p;
            requests.push({ level: i + 1, price: p });
          }
        }
      });
      if (!requests.length)
        throw new Error(
          "This path needs no purchases. Open Merge to combine your existing pairs.",
        );
      const steps = await approvals(ctx, eco, address, [], total);
      for (const r of requests)
        steps.push(
          marketStep(
            ctx,
            "createBid",
            [r.level, true, r.price, 0n],
            `Bid for level ${r.level}`,
            `Escrow ${amount(r.price, eco.decimals)} SQK for a merge-ready level ${r.level} Squeek. Default expiry: 7 days.`,
          ),
        );
      setChosen(undefined);
      review({
        title: "Create path bids",
        description: `Create ${requests.length} separate bids with ${amount(total, eco.decimals)} SQK total escrow. Each needs its own signature; partial completion leaves only confirmed bids on chain. Merges are separate, voluntary transactions after purchases.`,
        steps,
      });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="stack-large">
      <section className="surface">
        <div className="section-head">
          <h2>Plan a merge chain</h2>
          <GitMerge size={22} aria-hidden="true" />
        </div>
        <p className="muted">
          Compare up to four purchases. Paths rank the most merges first, then
          fewer purchases, then bonus power and known cost.
        </p>
        <div className="toolbar">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={manual}
              onChange={(e) => setManual(e.target.checked)}
            />
            Use a what-if inventory
          </label>
          <Field label="Maximum purchases">
            <select value={max} onChange={(e) => setMax(e.target.value)}>
              {[0, 1, 2, 3, 4].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Field>
        </div>
        {manual ? (
          <div className="inventory-grid">
            {counts.slice(0, eco?.policy.maximumLevel ?? 10).map((n, i) => (
              <Field key={i} label={`Level ${i + 1}`}>
                <input
                  type="number"
                  min="0"
                  max="9999"
                  value={n}
                  onChange={(e) =>
                    setCounts((old) =>
                      old.map((v, j) =>
                        i === j
                          ? Math.min(
                              9999,
                              Math.max(
                                0,
                                Math.floor(Number(e.target.value) || 0),
                              ),
                            )
                          : v,
                      ),
                    )
                  }
                />
              </Field>
            ))}
          </div>
        ) : (
          <div className="inventory-summary">
            {inventory.some(Boolean) ? (
              inventory.map(
                (n, i) =>
                  n > 0 && (
                    <span className="tag" key={i}>
                      {n} × Level {i + 1}
                    </span>
                  ),
              )
            ) : (
              <p className="muted">
                Inspect a wallet in My singles, or enter a what-if inventory
                above.
              </p>
            )}
          </div>
        )}
        {!eco && (
          <Notice tone="warn">
            The planner needs the live level and power table. Retry the contract
            check.
          </Notice>
        )}
        <p className="caption muted">
          {manual
            ? "What-if mode is a calculation, not a wallet balance. "
            : ""}
          Power tables come from SqueekMining. Cost uses current fillable floor
          asks, excludes gas and may change. Deposited Squeeks are excluded.
        </p>
      </section>
      {plans.length ? (
        <section className="surface">
          <h2>Paths worth a look</h2>
          <div className="path-list">
            {plans.map((plan, i) => (
              <article className="path" key={plan.buys.join(",")}>
                <div className="section-head">
                  <h3>
                    {i === 0 ? "Most merges" : `Alternative ${i}`} ·{" "}
                    {plan.purchases}{" "}
                    {plan.purchases === 1 ? "purchase" : "purchases"}
                  </h3>
                  <span className="tag success">
                    +{plan.gain.toLocaleString()} bonus power
                  </span>
                </div>
                <div className="path-chain">
                  {plan.buys.map(
                    (n, j) =>
                      n > 0 && (
                        <span className="path-node" key={`buy${j}`}>
                          <ShoppingBasket size={17} />
                          {n} × L{j + 1}
                        </span>
                      ),
                  )}
                  {plan.merges.map((m) => (
                    <span className="inline" key={m.level}>
                      <ArrowRight size={18} aria-hidden="true" />
                      <span className="path-node">
                        {m.count} merge{m.count > 1 ? "s" : ""} → L{m.level + 1}
                      </span>
                    </span>
                  ))}
                </div>
                <dl className="facts">
                  <div>
                    <dt>Estimated purchase cost</dt>
                    <dd>
                      {plan.cost === null
                        ? "No ask at one or more levels"
                        : `${amount(plan.cost, eco?.decimals)} SQK`}
                    </dd>
                  </div>
                  <div>
                    <dt>Purchased power + merge bonus</dt>
                    <dd>
                      {plan.addedPower.toLocaleString()} +{" "}
                      {plan.gain.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt>Cooldown after merges</dt>
                    <dd>
                      {plan.cooldownBlocks.toLocaleString()} Squeek blocks
                      {pace
                        ? ` · about ${((Number(plan.cooldownBlocks) / pace) * 24).toFixed(1)} hours at observed pace`
                        : " · hamster pace unavailable"}
                    </dd>
                  </div>
                </dl>
                <p className="caption muted">
                  Cooldown is a sequential upper bound. Existing cooldowns,
                  scheduled changes and a resting hamster can add time.
                </p>
                <button
                  type="button"
                  disabled={!plan.purchases}
                  onClick={() => choose(plan)}
                >
                  Turn path into bids
                  <ArrowRight size={16} />
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="surface">
          <Empty title="A chain starts with a pair">
            <p>
              Add your counts above. The planner finds purchases that improve
              the bonus from merging.
            </p>
          </Empty>
        </section>
      )}
      {chosen && (
        <Modal
          title="Set your path bids"
          onClose={() => setChosen(undefined)}
          busy={pending}
        >
          <div className="stack">
            <p>
              Choose the SQK you offer for each level. Each bid requires
              merge-ready at fill and expires after 7 days.
            </p>
            {chosen.buys.map(
              (n, i) =>
                n > 0 && (
                  <Field
                    key={i}
                    label={`${n} × Level ${i + 1} · SQK per Squeek`}
                  >
                    <input
                      value={bids[i] ?? ""}
                      inputMode="decimal"
                      onChange={(e) =>
                        setBids((old) => ({ ...old, [i]: e.target.value }))
                      }
                      placeholder="Enter a bid amount"
                    />
                  </Field>
                ),
            )}
            {reason && <Notice tone="warn">{reason}</Notice>}
            {error && <Notice tone="error">{error}</Notice>}
            <button
              type="button"
              className="primary"
              disabled={!!reason || pending}
              onClick={() => void queue()}
            >
              {pending && <IconSpin />}Review path bids
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
