import { useState } from "react";
import {
  useAccount,
  useConnect,
  useConnectors,
  useDisconnect,
  type Connector,
} from "wagmi";
import { LogOut, Wallet, ArrowUpRight } from "lucide-react";
import { OPEN_IN, switchProvider } from "./config";
import { errorText, short } from "./domain";
import { checksum } from "./service";
import { AddressLink, IconSpin, Modal, Notice } from "./components";
import type { Context } from "./types";
type Provider = Parameters<typeof switchProvider>[0];
export default function WalletControl({ ctx }: { ctx: Context }) {
  const { address, isConnected, chainId, connector } = useAccount();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const named = connectors.some(
    (c) => c.type === "injected" && c.id !== "injected",
  );
  const mobile =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
    !(window as Window & { ethereum?: unknown }).ethereum &&
    !named;
  const listed = connectors.filter(
    (c) =>
      !(named && c.id === "injected") && !(mobile && c.type === "injected"),
  );
  const wrong = isConnected && chainId !== ctx.deployment.chainId;
  async function switchChain(c = connector) {
    if (!c) return;
    setError("");
    setPending("switch");
    try {
      await switchProvider((await c.getProvider()) as Provider, ctx.deployment);
      setOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending("");
    }
  }
  async function choose(c: Connector) {
    setError("");
    setPending(c.uid);
    try {
      await connect.mutateAsync({ connector: c });
      await switchProvider((await c.getProvider()) as Provider, ctx.deployment);
      setOpen(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending("");
    }
  }
  return (
    <>
      <button
        type="button"
        className="wallet-button"
        onClick={() => {
          setError("");
          if (wrong) {
            setOpen(true);
            void switchChain();
          } else setOpen(true);
        }}
      >
        <Wallet size={17} aria-hidden="true" />
        {pending === "switch"
          ? "Switching…"
          : wrong
            ? `Switch to ${ctx.deployment.network.name}`
            : address
              ? short(checksum(address))
              : "Connect wallet"}
      </button>
      {open && (
        <Modal
          title={isConnected ? "Connected wallet" : "Connect a wallet"}
          onClose={() => setOpen(false)}
          busy={!!pending}
        >
          {isConnected && address ? (
            <div className="stack">
              <AddressLink address={address} ctx={ctx} full />
              <p className="muted">
                {wrong
                  ? `Your wallet is on another network. Switch to ${ctx.deployment.network.name} to continue.`
                  : `Connected on ${ctx.deployment.network.name}. Signing always happens in your wallet.`}
              </p>
              {wrong && (
                <button
                  type="button"
                  className="primary"
                  disabled={!!pending}
                  onClick={() => void switchChain()}
                >
                  {pending ? <IconSpin /> : null}Switch to{" "}
                  {ctx.deployment.network.name}
                </button>
              )}
              <button
                type="button"
                disabled={!!pending}
                onClick={() => {
                  disconnect.mutate();
                  setOpen(false);
                }}
              >
                <LogOut size={18} />
                Disconnect
              </button>
            </div>
          ) : (
            <div className="wallet-list">
              <p className="muted">
                Choose a wallet. No account or relay required.
              </p>
              {mobile &&
                OPEN_IN.map((w) => (
                  <a
                    className="wallet-row"
                    key={w.id}
                    href={w.href(location.href)}
                  >
                    <img
                      src={`./wallets/${w.id === "metamask" ? "metaMask" : w.id}.svg`}
                      width="28"
                      height="28"
                      alt=""
                    />
                    <span>Open in {w.name}</span>
                    <ArrowUpRight size={18} />
                  </a>
                ))}
              {listed.map((c) => (
                <button
                  type="button"
                  className="wallet-row"
                  disabled={!!pending}
                  key={c.uid}
                  onClick={() => void choose(c)}
                >
                  {c.icon ? (
                    <img src={c.icon} width="28" height="28" alt="" />
                  ) : c.type === "coinbaseWallet" ||
                    c.id.toLowerCase().includes("coinbase") ? (
                    <img
                      src="./wallets/coinbase.svg"
                      width="28"
                      height="28"
                      alt=""
                    />
                  ) : (
                    <Wallet size={28} aria-hidden="true" />
                  )}
                  <span>
                    {c.id === "injected"
                      ? "Browser wallet"
                      : c.type === "coinbaseWallet" ||
                          c.id.toLowerCase().includes("coinbase")
                        ? mobile
                          ? "Coinbase Smart Wallet"
                          : "Coinbase Wallet"
                        : c.name}
                  </span>
                  {pending === c.uid && <IconSpin />}
                </button>
              ))}
              {!named && !mobile && (
                <p className="caption muted">
                  No extension detected? Install a browser wallet or use
                  Coinbase’s passkey wallet.
                </p>
              )}
              {mobile && (
                <p className="caption muted">
                  Open this page inside your wallet app. If Rabby does not open,
                  paste this page’s URL into its browser.
                </p>
              )}
            </div>
          )}
          {error && <Notice tone="error">{error}</Notice>}
        </Modal>
      )}
    </>
  );
}
