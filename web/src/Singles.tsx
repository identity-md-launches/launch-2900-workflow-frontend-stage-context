import { useState } from "react";
import { useAccount } from "wagmi";
import { ArrowRight, Search, Wallet, GitMerge } from "lucide-react";
import { amount, groups } from "./domain";
import { AddressLink, Empty, Field, IconSpin, Notice } from "./components";
import type { Context, Squeek, Verification } from "./types";
export default function Singles({
  ctx,
  verification,
  tokens,
  scan,
  scanAddress,
  inspected,
  pending,
  progress,
  scanError,
  through,
  note,
  pace,
}: {
  ctx: Context;
  verification: Verification;
  tokens: Squeek[] | null;
  scan: (address: string) => void;
  scanAddress: string;
  inspected?: string;
  pending: boolean;
  progress: string;
  scanError: string;
  through?: bigint;
  note?: string;
  pace: number | null;
}) {
  const { address } = useAccount();
  const [input, setInput] = useState(scanAddress);
  const eco = verification.ecosystem;
  const levels = groups(tokens ?? [], eco?.policy.maximumLevel ?? 10).filter(
    (g) => g.members.length,
  );
  const singles = levels.reduce((sum, g) => sum + g.single, 0),
    pairs = levels.reduce((sum, g) => sum + g.pairs, 0);
  const totalPower = tokens?.reduce(
    (sum, t) => sum + t.position.activeWeight,
    0n,
  );
  const opportunity = eco
    ? levels.reduce(
        (sum, g) =>
          g.single && g.level < eco.policy.maximumLevel
            ? sum +
              (eco.policy.levels[g.level].weight -
                2n * eco.policy.levels[g.level - 1].weight)
            : sum,
        0n,
      )
    : 0n;
  const daily =
    eco && pace && eco.totalWeight > 0n
      ? ((Number(opportunity) * Number(eco.rewardPerBlock)) /
          Number(eco.totalWeight) /
          10 ** eco.decimals) *
        pace
      : null;
  return (
    <div className="stack-large">
      <section className="surface wallet-explorer">
        <div className="section-head">
          <h2>Find your singles</h2>
          <span className="tag">Read-only lookup</span>
        </div>
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            scan(input);
          }}
        >
          <Field
            label="Wallet address"
            hint="No connection needed to look. No signature requested."
          >
            <div className="address-input">
              <Search size={18} aria-hidden="true" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                name="walletAddress"
                autoComplete="off"
                spellCheck={false}
                placeholder="Paste an Ethereum address"
                aria-invalid={!!scanError}
                aria-describedby={scanError ? "scan-error" : undefined}
                required
              />
            </div>
          </Field>
          <div className="toolbar">
            <button
              type="submit"
              className="primary"
              disabled={pending || !eco}
            >
              {pending ? <IconSpin /> : <Search size={18} />}Find my singles
            </button>
            {address && (
              <button
                type="button"
                disabled={pending || !eco}
                onClick={() => {
                  setInput(address);
                  scan(address);
                }}
              >
                <Wallet size={17} />
                Use connected wallet
              </button>
            )}
          </div>
        </form>
        <div role="status" aria-live="polite">
          {pending && (
            <p className="caption muted">{progress || "Reading the chain…"}</p>
          )}
        </div>
        {scanError && (
          <div id="scan-error">
            <Notice tone="error">{scanError}</Notice>
          </div>
        )}
        {!eco && (
          <p className="caption muted">
            Loading the deployed Squeek contract. You can connect your wallet
            while it loads.
          </p>
        )}
        {tokens === null && !pending && (
          <Empty title="A small match. More power." illustration>
            <p>Spot the Squeeks left without a partner at each level.</p>
            <a className="inline" href="#planner">
              Try the chain planner
              <ArrowRight size={16} />
            </a>
          </Empty>
        )}
      </section>
      {tokens !== null && (
        <>
          <section className="portfolio-summary">
            <div>
              <span>Unpaired Squeeks</span>
              <strong>{singles}</strong>
            </div>
            <div>
              <span>Available pairs</span>
              <strong>{pairs}</strong>
            </div>
            <div>
              <span>Active power</span>
              <strong>{totalPower?.toLocaleString()}</strong>
            </div>
          </section>
          <section className="surface">
            <div className="section-head">
              <h2>Holdings by level</h2>
              <a className="button" href="#planner">
                Plan next merge
                <ArrowRight size={16} />
              </a>
            </div>
            {inspected && <AddressLink address={inspected} ctx={ctx} full />}
            <p className="caption muted">
              {through
                ? `Transfer history through Sepolia block ${through.toLocaleString()}; positions and ownership checked live.`
                : ""}{" "}
              Squeek cooldown blocks are earned by the hamster, not Ethereum.
            </p>
            {note && <Notice tone="warn">{note}</Notice>}
            {!tokens.length ? (
              <Empty title="No Squeeks found in this wallet">
                <p>
                  Inspect another address or visit the Match board to find a
                  partner.
                </p>
                <a className="button" href="#board">
                  Explore the Match board
                </a>
              </Empty>
            ) : (
              <div className="level-list">
                {levels.map((g) => (
                  <article className="level-group" key={g.level}>
                    <div className="section-head">
                      <div className="inline">
                        <span className="level-icon">L{g.level}</span>
                        <h3>Level {g.level}</h3>
                      </div>
                      <span className={`tag ${g.single ? "warning" : ""}`}>
                        {g.pairs} {g.pairs === 1 ? "pair" : "pairs"}
                        {g.single ? " + 1 single" : ""}
                      </span>
                    </div>
                    <div className="token-list">
                      {g.members.map((t, i) => {
                        const remaining =
                          eco &&
                          BigInt(t.position.nextMergeBlock) >
                            eco.state.blockHeight
                            ? BigInt(t.position.nextMergeBlock) -
                              eco.state.blockHeight
                            : 0n;
                        return (
                          <div className="token-row" key={String(t.id)}>
                            <span className="token-number">
                              #{String(t.id)}
                            </span>
                            <div>
                              <span className="tag">
                                {i === g.members.length - 1 && g.single
                                  ? "Single"
                                  : "Paired by count"}
                              </span>
                              <span className="caption">
                                {t.deposited
                                  ? "Deposited · withdraw to trade"
                                  : "In wallet"}
                              </span>
                            </div>
                            <div className="token-state">
                              <span>
                                {remaining > 0n
                                  ? `${remaining.toLocaleString()} blocks cooling`
                                  : "Cooldown complete"}
                              </span>
                              <span className="caption muted">
                                {t.position.pendingRound
                                  ? `Power ${t.position.pendingWeight.toLocaleString()} at round ${t.position.pendingRound}`
                                  : "No scheduled power change"}
                              </span>
                              <span className="caption muted">
                                {t.claimable === null
                                  ? "Rewards unavailable"
                                  : amount(t.claimable, eco?.decimals) +
                                    " SQK unclaimed"}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="opportunity">
            <GitMerge size={26} aria-hidden="true" />
            <div>
              <h2>Power waiting for a partner</h2>
              <p>
                <strong>{opportunity.toLocaleString()} bonus power</strong> if
                each single below the maximum level finds one same-level
                partner.
              </p>
              <p className="caption">
                Lost power estimate:{" "}
                {daily === null
                  ? "SQK/day unavailable; matching API pace or on-chain reward inputs are missing."
                  : `${daily.toLocaleString("en-US", { maximumFractionDigits: 4 })} SQK/day at observed hamster pace.`}{" "}
                This is a hypothetical opportunity, not a guaranteed yield.
                Purchase cost and dilution from new total power are excluded.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
