import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type ReactElement,
} from "react";
import { ArrowUpRight, Check, Copy, LoaderCircle, X } from "lucide-react";
import type { Context } from "./types";
import { checksum } from "./service";
import { short } from "./domain";
export function IconSpin() {
  return <LoaderCircle size={18} className="spinner" aria-hidden="true" />;
}
export function Modal({
  title,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => {
      ref.current?.close();
      opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !busy) onClose();
      }}
    >
      <div className="modal-content">
        <div className="section-head">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function AddressLink({
  address,
  ctx,
  full = false,
  label,
}: {
  address: string;
  ctx: Context;
  full?: boolean;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  let value: string;
  try {
    value = checksum(address);
  } catch {
    value = address;
  }
  return (
    <span className={`address ${full ? "full-address" : ""}`}>
      <a
        href={`${ctx.deployment.network.explorer}/address/${value}`}
        target="_blank"
        rel="noreferrer"
        title={value}
        aria-label={`${label ?? "Address"} ${value} on the explorer`}
      >
        <bdi>{full ? value : short(value)}</bdi>
        <ArrowUpRight size={14} aria-hidden="true" />
      </a>
      <button
        type="button"
        className="copy-button"
        aria-label={`Copy ${value}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <span className="sr-only" role="status">
        {copied ? "Address copied" : ""}
      </span>
    </span>
  );
}
export function Empty({
  title,
  children,
  illustration = false,
}: {
  title: string;
  children: ReactNode;
  illustration?: boolean;
}) {
  return (
    <div className={`empty ${illustration ? "with-art" : ""}`}>
      {illustration && (
        <img
          className="squeek-art"
          src="./partners.svg"
          width="240"
          height="150"
          alt=""
        />
      )}
      <div>
        <h3>{title}</h3>
        <div className="muted">{children}</div>
      </div>
    </div>
  );
}
export function Notice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn" | "error" | "success";
}) {
  return (
    <div
      className={`notice ${tone}`}
      role={tone === "error" ? "alert" : undefined}
    >
      {children}
    </div>
  );
}
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const id = useId();
  const hintId = id + "-hint";
  function bind(nodes: ReactNode): ReactNode {
    return Children.map(nodes, (node) => {
      if (!isValidElement(node)) return node;
      const element = node as ReactElement<Record<string, unknown>>;
      if (["input", "select", "textarea"].includes(String(element.type)))
        return cloneElement(element, {
          id,
          "aria-describedby":
            [element.props["aria-describedby"], hint ? hintId : undefined]
              .filter(Boolean)
              .join(" ") || undefined,
        });
      return element.props.children
        ? cloneElement(element, {}, bind(element.props.children as ReactNode))
        : element;
    });
  }
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {bind(children)}
      {hint && (
        <span id={hintId} className="field-hint">
          {hint}
        </span>
      )}
    </div>
  );
}
