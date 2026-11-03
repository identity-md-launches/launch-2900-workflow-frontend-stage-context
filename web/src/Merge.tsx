import { useState } from "react";
import { useAccount } from "wagmi";
import { GitMerge } from "lucide-react";
import { amount, errorText, positiveId, same } from "./domain";
import {
  inspectToken,
  TokenFacts,
  tradingReason,
  type Review,
  type TokenPreview,
} from "./Trade";
import { Field, IconSpin, Notice } from "./components";
import { ecosystem } from "./service";
import type { Context, Ecosystem, Squeek, Verification } from "./types";
export default function Merge({
  ctx,
  verification,
  tokens,
  review,
  received,
}: {
  ctx: Context;
  verification: Verification;
  tokens: Squeek[] | null;
  review: Review;
  received?: bigint;
}) {
  const { address, isConnected, chainId } = useAccount();
  const eco = verification.ecosystem;
  const [survivor, setSurvivor] = useState(received ? String(received) : "");
  const [donor, setDonor] = useState("");
  const [ack, setAck] = useState(false);
  const [preview, setPreview] = useState<{
    survivor: TokenPreview;
    donor: TokenPreview;
    eco: Ecosystem;
    ready: boolean;
    reason: string;
  }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const gate = tradingReason(
    verification,
    isConnected,
    chainId === ctx.deployment.chainId,
  );
  async function inspect() {
    if (!eco || pending) return;
    setPending(true);
    setError("");
    setPreview(undefined);
    setAck(false);
    try {
      const a = positiveId(survivor, "survivor ID"),
        b = positiveId(donor, "donor ID");
      if (a === b) throw new Error("Choose two different Squeeks.");
      const fresh = await ecosystem(ctx);
      const [s, d] = await Promise.all([
        inspectToken(ctx, fresh, a),
        inspectToken(ctx, fresh, b),
      ]);
      let reason = "";
      if (s.position.level !== d.position.level)
        reason = "Both Squeeks must be at the same level.";
      else if (s.position.level >= fresh.policy.maximumLevel)
        reason = "These Squeeks are at the maximum level.";
      else if (!s.ready || !d.ready)
        reason =
          "Wait for both cooldowns and pending power changes to complete.";
      else if (fresh.state.paused)
        reason = "Squeekchain is paused. Wait for it to resume.";
      else if (!same(s.owner, d.owner))
        reason =
          "Both Squeeks must be held by the same wallet. Withdraw deposited Squeeks first.";
      else if (address && !same(s.owner, address))
        reason = "Connect the wallet that owns both Squeeks.";
      setPreview({ survivor: s, donor: d, eco: fresh, ready: !reason, reason });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  }
  function merge() {
    if (!preview || !preview.ready || !ack || gate || !eco || !address) return;
    const level = preview.survivor.position.level;
    const power = preview.eco.policy.levels[level]?.weight;
    review({
      title: "Confirm permanent merge",
      description: `Keep Squeek #${preview.survivor.id}. Permanently burn Squeek #${preview.donor.id}. The survivor becomes level ${level + 1} with ${power?.toLocaleString()} scheduled power; activation and cooldown follow SqueekMining rules. This cannot be undone.`,
      steps: [
        {
          label: `Burn #${preview.donor.id} and merge`,
          address: preview.eco.mining,
          abi: ctx.abis.SqueekMining,
          functionName: "merge",
          args: [0, preview.survivor.id, preview.donor.id],
          description:
            "Official SqueekMining merge: collection 0, survivor first, donor second. The donor NFT is permanently destroyed.",
        },
      ],
    });
  }
  async function claim() {
    if (!preview || !address || gate) return;
    review({
      title: "Claim rewards first",
      description: `Claim the available SQK for #${preview.survivor.id} and #${preview.donor.id} into the connected owner’s wallet. This is separate from merging.`,
      steps: [
        {
          label: "Claim SQK",
          address: preview.eco.mining,
          abi: ctx.abis.SqueekMining,
          functionName: "claim",
          args: [
            0,
            [preview.survivor.id, preview.donor.id].sort((a, b) =>
              a < b ? -1 : 1,
            ),
          ],
          description:
            "Claims current mining rewards for both NFTs. Read amounts are estimates until confirmation.",
        },
      ],
    });
  }
  return (
    <section className="surface form-surface stack">
      <div className="section-head">
        <h2>Choose who stays</h2>
        <GitMerge size={22} aria-hidden="true" />
      </div>
      <p className="muted">
        Two Squeeks of the same level become one stronger Squeek. The donor is
        permanently burned.
      </p>
      {received && (
        <Notice tone="success">
          Trade confirmed. Squeek #{String(received)} is selected as the
          survivor; choose its partner.
        </Notice>
      )}
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          void inspect();
        }}
      >
        <div className="form-grid">
          <Field label="Survivor ID · keep this Squeek">
            <input
              inputMode="numeric"
              list="wallet-squeeks"
              value={survivor}
              onChange={(e) => {
                setSurvivor(e.target.value);
                setPreview(undefined);
              }}
              required
              placeholder="Squeek to keep"
            />
          </Field>
          <Field label="Donor ID · burn this Squeek">
            <input
              inputMode="numeric"
              list="wallet-squeeks"
              value={donor}
              onChange={(e) => {
                setDonor(e.target.value);
                setPreview(undefined);
              }}
              required
              placeholder="Squeek to burn"
            />
          </Field>
        </div>
        <datalist id="wallet-squeeks">
          {tokens
            ?.filter((t) => !t.deposited)
            .map((t) => (
              <option value={String(t.id)} key={String(t.id)}>
                Level {t.position.level}
              </option>
            ))}
        </datalist>
        <button type="submit" disabled={pending || !eco}>
          {pending && <IconSpin />}Preview merge
        </button>
      </form>
      {preview && (
        <>
          <div className="form-grid">
            <div>
              <h3>Survivor · keep</h3>
              <TokenFacts token={preview.survivor} eco={preview.eco} />
            </div>
            <div>
              <h3>Donor · burn</h3>
              <TokenFacts token={preview.donor} eco={preview.eco} />
            </div>
          </div>
          {preview.survivor.position.level === preview.donor.position.level &&
            preview.survivor.position.level <
              preview.eco.policy.maximumLevel && (
              <div className="merge-result">
                <GitMerge size={24} />
                <div>
                  <strong>
                    Level {preview.survivor.position.level + 1} ·{" "}
                    {preview.eco.policy.levels[
                      preview.survivor.position.level
                    ].weight.toLocaleString()}{" "}
                    power
                  </strong>
                  <p className="caption muted">
                    Current combined active power:{" "}
                    {(
                      preview.survivor.position.activeWeight +
                      preview.donor.position.activeWeight
                    ).toLocaleString()}
                    . New cooldown:{" "}
                    {preview.eco.policy.levels[
                      preview.survivor.position.level
                    ].cooldownBlocks.toLocaleString()}{" "}
                    Squeek blocks. Power starts after the contract’s scheduled
                    activation.
                  </p>
                </div>
              </div>
            )}
          <p className="caption muted">
            Unclaimed rewards:{" "}
            {preview.survivor.claimable !== null &&
            preview.donor.claimable !== null
              ? amount(
                  preview.survivor.claimable + preview.donor.claimable,
                  eco?.decimals,
                ) + " SQK"
              : "unavailable"}
            . Claiming first makes the reward balance explicit.
          </p>
          <button
            type="button"
            onClick={() => void claim()}
            disabled={
              !!gate ||
              !same(preview.survivor.owner, address) ||
              !same(preview.donor.owner, address)
            }
          >
            Claim SQK before merging
          </button>
          {preview.reason && <Notice tone="warn">{preview.reason}</Notice>}
          <label className="checkbox">
            <input
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            I confirm #{String(preview.survivor.id)} survives and #
            {String(preview.donor.id)} is permanently burned.
          </label>
          <button
            type="button"
            className="primary"
            disabled={
              !ack ||
              !preview.ready ||
              !!gate ||
              !same(preview.survivor.owner, address) ||
              !same(preview.donor.owner, address)
            }
            onClick={merge}
          >
            Review permanent merge
          </button>
        </>
      )}
      {gate && <Notice tone="warn">{gate}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="separated">
        <h3>Deposited Squeeks</h3>
        <p className="caption muted">
          Withdraw deposited Squeeks before trading. The published deployment
          and ABIs supplied for this NFT expose no Staking deposit or
          mergeDeposited method. Deposited merging stays unavailable until a
          matching official integration is published and verified. API staking
          addresses from another deployment are never used.
        </p>
      </div>
    </section>
  );
}
