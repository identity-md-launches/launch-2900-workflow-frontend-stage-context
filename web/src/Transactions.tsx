import { useRef, useState } from "react";
import { useAccount } from "wagmi";
import {
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { ArrowUpRight, Check, ShieldCheck } from "lucide-react";
import { makeChain } from "./config";
import { errorText, same } from "./domain";
import { verifyIdentity } from "./service";
import { IconSpin, Modal, Notice } from "./components";
import type { Context, TxPlan, Verification } from "./types";
export default function TransactionReview({
  ctx,
  plan,
  close,
  refresh,
  onVerify,
}: {
  ctx: Context;
  plan: TxPlan;
  close: () => void;
  refresh: () => Promise<void>;
  onVerify: (v: Verification) => void;
}) {
  const { address, connector, chainId } = useAccount();
  const [stepIndex, setStepIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState("");
  const [hash, setHash] = useState<Hex>();
  const [receipts, setReceipts] = useState<Hex[]>([]);
  const lock = useRef(false);
  const initialAccount = useRef(address);
  const done = stepIndex >= plan.steps.length;
  const unconfirmed = !!hash && !receipts.includes(hash);
  async function confirm(sent: Hex) {
    setPhase("Waiting for on-chain confirmation…");
    const receipt = await ctx.client.waitForTransactionReceipt({
      hash: sent,
      confirmations: 1,
      timeout: 180000,
    });
    if (receipt.status !== "success") {
      setHash(undefined);
      throw new Error(
        "The transaction reverted. Refresh the chain state and review the action again.",
      );
    }
    setPhase("Refreshing confirmed state…");
    // Receipt success is durable even if refreshing the display fails. Never resend a confirmed step.
    await refresh().catch(() =>
      setError(
        "Transaction confirmed, but display refresh failed. Refresh the page before starting a new action.",
      ),
    );
    setReceipts((r) => [...r, sent]);
    setStepIndex((i) => i + 1);
    if (stepIndex + 1 === plan.steps.length) plan.onSuccess?.();
  }
  async function execute() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    try {
      // If a receipt lookup timed out, retry only the lookup. A hash is never permission to resend.
      if (unconfirmed && hash) {
        await confirm(hash);
        return;
      }
      if (!address || !connector || !same(address, initialAccount.current))
        throw new Error(
          "The connected account changed. Close this review and prepare the action again.",
        );
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const wallet = createWalletClient({
        account: address,
        chain: makeChain(ctx.deployment),
        transport: custom(provider),
      });
      const [walletChain, accounts] = await Promise.all([
        wallet.getChainId(),
        wallet.getAddresses(),
      ]);
      if (
        walletChain !== ctx.deployment.chainId ||
        chainId !== ctx.deployment.chainId ||
        !same(accounts[0], address)
      )
        throw new Error(
          "Switch the connected wallet to Sepolia and review this action again.",
        );
      setPhase("Checking live state…");
      const step = plan.steps[stepIndex];
      if (plan.requiresIdentity !== false) {
        const v = await verifyIdentity(ctx);
        onVerify(v);
        if (!v.ok || !v.ecosystem) throw new Error(v.message);
        const targets = [
          ctx.escrow.address,
          v.ecosystem.nft,
          v.ecosystem.token,
          v.ecosystem.mining,
        ];
        if (!targets.some((a) => same(a, step.address)))
          throw new Error(
            "The contract graph changed. Close this review and prepare it again.",
          );
      } else {
        const code = await ctx.client.getCode({ address: ctx.escrow.address });
        if (
          (await ctx.client.getChainId()) !== ctx.deployment.chainId ||
          !code ||
          code === "0x"
        )
          throw new Error(
            "Unable to verify the escrow for cancellation. Try again.",
          );
      }
      setPhase("Simulating transaction…");
      const simulation = await ctx.client.simulateContract({
        address: step.address,
        abi: step.abi,
        functionName: step.functionName,
        args: step.args,
        account: address,
      });
      // No wallet signature is requested until eth_call succeeds for this exact action and account.
      setPhase("Confirm in your wallet…");
      const sent = await wallet.writeContract({
        ...simulation.request,
        account: address,
        chain: makeChain(ctx.deployment),
      });
      setHash(sent);
      await confirm(sent);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
      setPhase("");
      lock.current = false;
    }
  }
  return (
    <Modal title={plan.title} onClose={close} busy={pending}>
      <div className="stack">
        <p>{plan.description}</p>
        <ol className="tx-steps">
          {plan.steps.map((s, i) => (
            <li
              key={`${s.functionName}-${i}`}
              className={
                i < stepIndex ? "complete" : i === stepIndex ? "current" : ""
              }
            >
              <span className="step-number">
                {i < stepIndex ? <Check size={16} /> : i + 1}
              </span>
              <div>
                <span>{s.label}</span>
                {i === stepIndex && (
                  <p className="caption muted">{s.description}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
        {!done && (
          <div className="simulation-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              Each step is checked on chain before your wallet opens. Gas is
              paid in Sepolia ETH.
            </span>
          </div>
        )}
        <div role="status" aria-live="polite">
          {pending && (
            <span className="inline">
              <IconSpin />
              {phase}
            </span>
          )}
          {done && (
            <Notice tone="success">All steps confirmed on Sepolia.</Notice>
          )}
        </div>
        {error && (
          <Notice tone="error">
            {error}
            {unconfirmed
              ? " A transaction was already submitted. Check its confirmation; do not submit it again."
              : ""}
          </Notice>
        )}
        {hash && !receipts.includes(hash) && (
          <a
            className="inline"
            href={`${ctx.deployment.network.explorer}/tx/${hash}`}
            target="_blank"
            rel="noreferrer"
          >
            Track transaction
            <ArrowUpRight size={16} />
          </a>
        )}
        {receipts.map((receipt, i) => (
          <a
            className="inline caption"
            key={receipt}
            href={`${ctx.deployment.network.explorer}/tx/${receipt}`}
            target="_blank"
            rel="noreferrer"
          >
            Step {i + 1} confirmed
            <ArrowUpRight size={16} />
          </a>
        ))}
        {done ? (
          <button type="button" className="primary" onClick={close}>
            Done
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            disabled={
              pending ||
              !same(address, initialAccount.current) ||
              chainId !== ctx.deployment.chainId
            }
            onClick={() => void execute()}
          >
            {pending && <IconSpin />}
            {pending
              ? unconfirmed
                ? "Checking confirmation…"
                : plan.steps[stepIndex].label + "…"
              : unconfirmed
                ? "Check confirmation"
                : plan.steps[stepIndex].label}
          </button>
        )}
        {!done && stepIndex > 0 && (
          <p className="caption muted">
            You can close now. Confirmed approvals remain on chain; an order is
            created only after its own step confirms.
          </p>
        )}
      </div>
    </Modal>
  );
}
