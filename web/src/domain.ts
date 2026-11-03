import { formatUnits, parseUnits, isAddress, getAddress } from "viem";
import type { Policy, Squeek } from "./types";
export const short = (a: string) =>
  a.length > 18 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
export const same = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export const amount = (n: bigint, decimals = 18) => {
  const negative = n < 0n;
  const [whole, fraction] = formatUnits(negative ? -n : n, decimals).split(".");
  // Preserve every base unit in balances and confirmation amounts, including sub-0.0001 SQK values.
  return `${negative ? "-" : ""}${BigInt(whole).toLocaleString("en-US")}${fraction ? "." + fraction : ""}`;
};
export function positiveId(s: string, label = "Squeek ID") {
  if (!/^[1-9]\d*$/.test(s.trim()))
    throw new Error(`Enter a positive whole number for ${label}.`);
  const n = BigInt(s.trim());
  if (n >= 2n ** 256n) throw new Error(`${label} is too large.`);
  return n;
}
export function sqk(s: string, decimals: number, allowZero = false) {
  if (
    !/^\d+(\.\d+)?$/.test(s.trim()) ||
    (s.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter an SQK amount with at most ${decimals} decimal places.`,
    );
  const n = parseUnits(s, decimals);
  if (n < 0n || (!allowZero && n === 0n) || n >= 2n ** 256n)
    throw new Error("Enter a positive SQK amount within the token limit.");
  return n;
}
export function addressValue(s: string) {
  const value = s.trim();
  if (!isAddress(value) || /^0x0{40}$/i.test(value))
    throw new Error(
      "Paste a complete Ethereum address (0x and 40 hexadecimal characters).",
    );
  return getAddress(value);
}
export function groups(tokens: Squeek[], max = 10) {
  return Array.from({ length: max }, (_, i) => {
    const level = i + 1;
    const members = tokens.filter((t) => t.position.level === level);
    return {
      level,
      members,
      pairs: Math.floor(members.length / 2),
      single: members.length % 2,
    };
  });
}
export type Plan = {
  buys: number[];
  purchases: number;
  merges: { level: number; count: number }[];
  gain: bigint;
  addedPower: bigint;
  cost: bigint | null;
  cooldownBlocks: bigint;
  final: number[];
};
export function simulatePlan(
  counts: number[],
  buys: number[],
  policy: Policy,
  prices: (bigint | null)[],
): Plan {
  const final = counts.map((n, i) => n + (buys[i] ?? 0));
  const merges: Plan["merges"] = [];
  let gain = 0n;
  let addedPower = 0n;
  let cost: bigint | null = 0n;
  let cooldownBlocks = 0n;
  for (let i = 0; i < policy.maximumLevel; i++) {
    const b = buys[i] ?? 0;
    addedPower += BigInt(b) * policy.levels[i].weight;
    if (b)
      cost =
        prices[i] === null || prices[i] === undefined || cost === null
          ? null
          : cost + prices[i]! * BigInt(b);
    if (i < policy.maximumLevel - 1) {
      const count = Math.floor(final[i] / 2);
      final[i] %= 2;
      final[i + 1] = (final[i + 1] ?? 0) + count;
      if (count) {
        merges.push({ level: i + 1, count });
        gain +=
          BigInt(count) *
          (policy.levels[i + 1].weight - 2n * policy.levels[i].weight);
        // Sequential upper-bound path: independent merges could run in parallel.
        cooldownBlocks += BigInt(count) * policy.levels[i + 1].cooldownBlocks;
      }
    }
  }
  return {
    buys,
    purchases: buys.reduce((a, b) => a + b, 0),
    merges,
    gain,
    addedPower,
    cost,
    cooldownBlocks,
    final,
  };
}
/** Exhaustive combinations up to four purchases; most merges, fewest buys, bonus power, then cost. */
export function planChains(
  counts: number[],
  policy: Policy,
  prices: (bigint | null)[],
  maxBuys: number,
): Plan[] {
  const candidates: Plan[] = [];
  const buys = Array(policy.maximumLevel).fill(0) as number[];
  function visit(level: number, remaining: number) {
    if (level === policy.maximumLevel - 1) {
      candidates.push(simulatePlan(counts, [...buys], policy, prices));
      return;
    }
    for (let n = 0; n <= remaining; n++) {
      buys[level] = n;
      visit(level + 1, remaining - n);
    }
    buys[level] = 0;
  }
  visit(0, Math.min(4, Math.max(0, maxBuys)));
  const baseline = simulatePlan(
    counts,
    Array(counts.length).fill(0),
    policy,
    prices,
  );
  const costOrder = (a: Plan, b: Plan) =>
    a.cost === b.cost
      ? 0
      : a.cost === null
        ? 1
        : b.cost === null
          ? -1
          : a.cost < b.cost
            ? -1
            : 1;
  return candidates
    .filter(
      (p) => p.merges.length && (p.purchases === 0 || p.gain > baseline.gain),
    )
    .sort(
      (a, b) =>
        b.merges.reduce((sum, m) => sum + m.count, 0) -
          a.merges.reduce((sum, m) => sum + m.count, 0) ||
        a.purchases - b.purchases ||
        (a.gain === b.gain ? 0 : a.gain > b.gain ? -1 : 1) ||
        costOrder(a, b) ||
        a.buys.reduce((sum, n, level) => sum + n * level, 0) -
          b.buys.reduce((sum, n, level) => sum + n * level, 0),
    )
    .slice(0, 5);
}
const friendly: Record<string, string> = {
  OrderExpired:
    "This order has expired. Refresh the board or cancel it to release escrowed SQK.",
  OrderNotOpen:
    "This order has already been filled or cancelled. Refresh the board.",
  StaleOrder:
    "This Squeek has traded since it was listed. Ask the maker for a new order.",
  MakerNoLongerOwns:
    "The seller no longer holds this Squeek. Refresh the listing.",
  NotTokenOwner:
    "This Squeek is not held by the connected wallet. Withdraw deposited Squeeks before trading.",
  EscrowNotApproved:
    "Approve this Squeek for the market, then review the trade again.",
  LevelMismatch:
    "The Squeek level has changed or does not match this order. Refresh and choose a matching level.",
  CooldownActive:
    "This Squeek is still cooling down. Wait for the required Squeek block height.",
  PowerChangePending:
    "A power change is scheduled. Wait until it activates before merging.",
  AtMaximumLevel: "This Squeek is at its maximum level and cannot merge.",
  BothSidesPaySqk:
    "Only one side of a swap can add SQK. Set the other amount to zero.",
  SameToken: "Choose two different Squeeks.",
  SelfTrade: "You cannot fill your own order.",
  WrongToken: "This swap requires a specific Squeek. Choose the requested ID.",
  NoLivePosition: "This Squeek has no live mining position.",
  NotMakerAndNotExpired: "Only the maker can cancel before expiry.",
  SafeERC20FailedOperation:
    "The SQK transfer failed. Check your balance and allowance.",
  DurationTooLong: "Orders can last at most 30 days.",
  ZeroAmount: "Enter an SQK amount greater than zero.",
  InvalidLevel: "Choose a valid, fillable Squeek level.",
};
export function errorText(error: unknown): string {
  const e = error as {
    code?: number;
    message?: string;
    shortMessage?: string;
    cause?: unknown;
    data?: { errorName?: string };
    name?: string;
  };
  if (
    e?.code === 4001 ||
    /rejected|denied|cancelled by user/i.test(e?.message ?? "")
  )
    return "Request declined in your wallet. Nothing else was submitted; you can try again.";
  if (/insufficient funds/i.test(e?.message ?? ""))
    return "Not enough Sepolia ETH for gas. Use a Sepolia faucet, then try again.";
  for (let current: unknown = error, depth = 0; current && depth < 8; depth++) {
    const x = current as typeof e;
    if (x.data?.errorName && friendly[x.data.errorName])
      return friendly[x.data.errorName];
    const text = x.shortMessage ?? x.message ?? "";
    const match = Object.keys(friendly).find((k) => text.includes(k));
    if (match) return friendly[match];
    current = x.cause;
  }
  return (
    e?.shortMessage?.slice(0, 240) ||
    e?.message?.slice(0, 240) ||
    "Unable to complete this request. Refresh the chain state and try again."
  );
}
