import { getAddress, type Abi, type Address } from "viem";
import { fetchJson, SOURCES } from "./config";
import { same } from "./domain";
import { indexEvents, type ScanProgress } from "./indexer";
import type {
  Context,
  Ecosystem,
  Verification,
  IdentityRow,
  Policy,
  CoreState,
  MiningState,
  Position,
  Squeek,
  Order,
  TxStep,
  ApiData,
  IndexedEvent,
} from "./types";
export function read<T>(
  ctx: Context,
  address: Address,
  abi: Abi,
  functionName: string,
  args: readonly unknown[] = [],
  blockNumber?: bigint,
): Promise<T> {
  return ctx.client.readContract({
    address,
    abi,
    functionName,
    args,
    ...(blockNumber !== undefined ? { blockNumber } : {}),
  }) as Promise<T>;
}
export const escrowRead = <T>(
  ctx: Context,
  fn: string,
  args: readonly unknown[] = [],
  block?: bigint,
) => read<T>(ctx, ctx.escrow.address, ctx.escrowAbi, fn, args, block);
export async function ecosystem(ctx: Context): Promise<Ecosystem> {
  const blockNumber = await ctx.client.getBlockNumber({ cacheTime: 0 });
  const [nft, token, mining] = await Promise.all([
    escrowRead<Address>(ctx, "SQUEEK", [], blockNumber),
    escrowRead<Address>(ctx, "SQK", [], blockNumber),
    escrowRead<Address>(ctx, "mining", [], blockNumber),
  ]);
  const core = await read<Address>(
    ctx,
    mining,
    ctx.abis.SqueekMining,
    "core",
    [],
    blockNumber,
  );
  const [decimals, symbol, policy, state, miningState, rewardPerBlock] =
    await Promise.all([
      read<number>(
        ctx,
        token,
        ctx.abis.SqueekToken,
        "decimals",
        [],
        blockNumber,
      ),
      read<string>(ctx, token, ctx.abis.SqueekToken, "symbol", [], blockNumber),
      read<Policy>(
        ctx,
        mining,
        ctx.abis.SqueekMining,
        "collectionPolicy",
        [0],
        blockNumber,
      ),
      read<CoreState>(ctx, core, ctx.abis.SqueekCore, "state", [], blockNumber),
      read<MiningState>(
        ctx,
        mining,
        ctx.abis.SqueekMining,
        "state",
        [],
        blockNumber,
      ),
      read<bigint>(
        ctx,
        mining,
        ctx.abis.SqueekMining,
        "REWARD_PER_BLOCK",
        [],
        blockNumber,
      ),
    ]);
  return {
    nft,
    token,
    mining,
    core,
    decimals,
    symbol,
    policy,
    state,
    totalWeight: miningState.totalWeight,
    rewardPerBlock,
    blockNumber,
  };
}
export async function verifyIdentity(ctx: Context): Promise<Verification> {
  const rows: IdentityRow[] = [];
  let eco: Ecosystem | undefined;
  try {
    const [chainId, code] = await Promise.all([
      ctx.client.getChainId(),
      ctx.client.getCode({ address: ctx.escrow.address }),
    ]);
    rows.push({
      label: "RPC chain",
      expected: String(ctx.deployment.chainId),
      actual: String(chainId),
      ok: chainId === ctx.deployment.chainId,
    });
    rows.push({
      label: "Attested escrow code",
      expected: "Deployed contract",
      actual: code && code !== "0x" ? "Code present" : "No code",
      ok: !!code && code !== "0x",
    });
    if (rows.some((r) => !r.ok))
      throw new Error(
        "The configured RPC or deployed escrow failed verification.",
      );
    eco = await ecosystem(ctx);
    // Live docs must still match the shipped reference; the API alone never selects transaction targets.
    const results = await Promise.allSettled([
      fetchJson<Context["docs"]>(SOURCES.deployments),
      fetchJson<{
        chain: { chainId: string };
        identities: {
          token: Address;
          core: Address;
          mining: { proxy: Address };
        };
        asset: { address: Address };
      }>(`${SOURCES.api}/v1/economy/state`),
    ]);
    const documented = ctx.docs.contracts;
    for (const [name, actual] of [
      ["SqueekNFT", eco.nft],
      ["SqueekToken", eco.token],
      ["SqueekMining", eco.mining],
      ["SqueekCore", eco.core],
    ] as const) {
      const expected = documented[name]?.address;
      rows.push({
        label: `${name} · published snapshot`,
        expected,
        actual,
        ok: same(expected, actual),
      });
      const live = results[0];
      if (live.status === "fulfilled")
        rows.push({
          label: `${name} · live documentation`,
          expected: actual,
          actual: live.value.contracts[name]?.address,
          ok:
            live.value.chainId === ctx.deployment.chainId &&
            same(actual, live.value.contracts[name]?.address),
        });
    }
    rows.push({
      label: "Mining collection and SQK",
      expected: `${eco.nft} / ${eco.symbol}`,
      actual: `${eco.policy.nft} / ${eco.decimals} decimals`,
      ok:
        same(eco.nft, eco.policy.nft) &&
        eco.symbol === "SQK" &&
        eco.decimals === 18,
    });
    const cfg = await read<{
      token: Address;
      genesisCollection: Address;
      core: Address;
    }>(ctx, eco.mining, ctx.abis.SqueekMining, "configuration");
    rows.push({
      label: "Mining contract graph",
      expected: eco.token,
      actual: cfg.token,
      ok:
        same(cfg.token, eco.token) &&
        same(cfg.genesisCollection, eco.nft) &&
        same(cfg.core, eco.core),
    });
    const codes = await Promise.all(
      [eco.nft, eco.token, eco.mining, eco.core].map((address) =>
        ctx.client.getCode({ address }),
      ),
    );
    rows.push({
      label: "Squeekchain contract code",
      expected: "Four deployed contracts",
      actual: `${codes.filter((code) => code && code !== "0x").length} contracts with code`,
      ok: codes.every((code) => !!code && code !== "0x"),
    });
    if (results[1].status === "fulfilled") {
      const api = results[1].value;
      for (const [label, expected, actual] of [
        ["API SQK token", eco.token, api.identities?.token],
        ["API asset", eco.token, api.asset?.address],
        ["API mining", eco.mining, api.identities?.mining?.proxy],
        ["API core", eco.core, api.identities?.core],
      ] as const)
        rows.push({ label, expected, actual, ok: same(expected, actual) });
      rows.push({
        label: "API chain",
        expected: String(ctx.deployment.chainId),
        actual: api.chain?.chainId,
        ok: Number(api.chain?.chainId) === ctx.deployment.chainId,
      });
    }
    const mismatch = rows.some((row) => !row.ok);
    const unavailable = results.some((result) => result.status === "rejected");
    const ok = !mismatch && !unavailable;
    return {
      ok,
      status: mismatch ? "mismatch" : unavailable ? "unavailable" : "verified",
      ecosystem: eco,
      checkedAt: Date.now(),
      rows,
      message: mismatch
        ? "Squeekchain identities disagree. Trading and merging are paused."
        : unavailable
          ? "Unable to verify all identity sources. Trading stays paused; retry the check."
          : "Sepolia, escrow, documentation and API identities match.",
    };
  } catch (error) {
    return {
      ok: false,
      status: "unavailable",
      ecosystem: eco,
      checkedAt: Date.now(),
      rows,
      message: `Verification unavailable. ${error instanceof Error ? error.message.slice(0, 160) : "Check the RPC and try again."}`,
    };
  }
}
export async function loadWallet(
  ctx: Context,
  eco: Ecosystem,
  owner: Address,
  progress: ScanProgress,
  signal?: AbortSignal,
) {
  const index = await indexEvents(
    ctx,
    eco.nft,
    ctx.abis.SqueekNFT,
    BigInt(ctx.docs.deploymentBlock),
    progress,
    signal,
  );
  const ids = new Set<string>();
  for (const event of index.events)
    if (event.name === "Transfer") {
      const id = String(event.args.tokenId);
      if (same(String(event.args.to), owner)) ids.add(id);
      else if (same(String(event.args.from), owner)) ids.delete(id);
    }
  // API deposit information is display-only and ignored if its identity does not match this escrow.
  let apiNote: string | undefined;
  let depositedIds: string[] = [];
  try {
    type AccountPage = {
      status: string;
      identities?: { token?: string };
      tokens?: { tokenId: string; custody: string }[];
      nextCursor?: string | null;
    };
    let cursor: string | null = null;
    const visited = new Set<string>();
    do {
      signal?.throwIfAborted();
      const query = new URLSearchParams({
        limit: "100",
        ...(cursor ? { cursor } : {}),
      });
      const api: AccountPage = await fetchJson<AccountPage>(
        `${SOURCES.api}/v1/accounts/${owner}?${query}`,
      );
      if (!same(api.identities?.token, eco.token)) {
        apiNote =
          "API account identities differ. Deposit and API reward data are excluded; wallet holdings below come from the attested NFT.";
        depositedIds = [];
        break;
      }
      if (api.status !== "available")
        throw new Error("Account API is unavailable.");
      depositedIds.push(
        ...(api.tokens ?? [])
          .filter((item) => item.custody === "staking")
          .map((item) => item.tokenId),
      );
      cursor = api.nextCursor ?? null;
      if (cursor && visited.has(cursor))
        throw new Error("Account API repeated its pagination cursor.");
      if (cursor) visited.add(cursor);
    } while (cursor !== null);
  } catch {
    depositedIds = [];
    apiNote =
      "Account API unavailable. Wallet holdings still come from on-chain transfer events; deposited holdings may be absent.";
  }
  depositedIds.forEach((id) => ids.add(id));
  const list = [...ids].map(BigInt).sort((a, b) => (a < b ? -1 : 1));
  const tokens: Squeek[] = [];
  for (let i = 0; i < list.length; i += 20) {
    signal?.throwIfAborted();
    progress(
      `Checking live positions ${i + 1}–${Math.min(i + 20, list.length)} of ${list.length}`,
    );
    tokens.push(
      ...(
        await Promise.all(
          list.slice(i, i + 20).map(async (id) => {
            try {
              const [actualOwner, position, claim] = await Promise.all([
                read<Address>(ctx, eco.nft, ctx.abis.SqueekNFT, "ownerOf", [
                  id,
                ]),
                read<Position>(
                  ctx,
                  eco.mining,
                  ctx.abis.SqueekMining,
                  "position",
                  [0, id],
                ),
                read<bigint>(
                  ctx,
                  eco.mining,
                  ctx.abis.SqueekMining,
                  "claimable",
                  [0, [id]],
                ).catch(() => null),
              ]);
              return same(actualOwner, owner) ||
                depositedIds.includes(String(id))
                ? {
                    id,
                    owner: actualOwner,
                    position,
                    claimable: claim,
                    deposited: !same(actualOwner, owner),
                  }
                : null;
            } catch {
              throw new Error(
                `Unable to read Squeek #${id}. Retry the scan; partial holdings are not shown.`,
              );
            }
          }),
        )
      ).filter((t): t is Squeek => t !== null),
    );
  }
  // Do not silently treat recent, unconfirmed transfers as an empty wallet.
  const liveBalance = await read<bigint>(
    ctx,
    eco.nft,
    ctx.abis.SqueekNFT,
    "balanceOf",
    [owner],
  );
  if (liveBalance !== BigInt(tokens.filter((t) => !t.deposited).length))
    apiNote = `${apiNote ? apiNote + " " : ""}The latest NFT balance differs from the confirmed event index. Recent transfers may be awaiting 12 confirmations. Refresh later.`;
  return { tokens, through: index.through, apiNote };
}
export async function loadOrders(
  ctx: Context,
  progress: ScanProgress,
  signal?: AbortSignal,
) {
  const index = await indexEvents(
    ctx,
    ctx.escrow.address,
    ctx.escrowAbi,
    BigInt(ctx.provenance.escrowDeploymentBlock),
    progress,
    signal,
  );
  const ids = [
    ...new Set(
      index.events
        .filter((e) => /^(Ask|Bid|Swap)Created$/.test(e.name))
        .map((e) => String(e.args.askId ?? e.args.bidId ?? e.args.swapId)),
    ),
  ].map(BigInt);
  // Include orders in the last 12 blocks, which have not reached the log index yet.
  const next = await escrowRead<bigint>(ctx, "nextOrderId");
  const highest = ids.reduce((a, b) => (a > b ? a : b), 0n);
  if (next - highest > 200n)
    throw new Error(
      "The order index is incomplete. Clear its cache and scan again.",
    );
  for (let id = highest + 1n; id < next; id++) ids.push(id);
  const orders: Order[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    signal?.throwIfAborted();
    progress(
      `Refreshing orders ${i + 1}–${Math.min(i + 20, ids.length)} of ${ids.length}`,
    );
    orders.push(
      ...(await Promise.all(
        ids.slice(i, i + 20).map((id) => loadOrder(ctx, id)),
      )),
    );
  }
  return {
    orders,
    through: index.through,
    fills: index.events
      .filter((e) => /Filled$/.test(e.name))
      .slice(-12)
      .reverse(),
  };
}
export async function loadOrder(ctx: Context, id: bigint): Promise<Order> {
  const kind = await escrowRead<number>(ctx, "kindOf", [id]);
  if (kind < 1 || kind > 3)
    throw new Error("This order does not exist. Check the order ID.");
  const value = await escrowRead<readonly unknown[]>(
    ctx,
    kind === 1 ? "asks" : kind === 2 ? "bids" : "swaps",
    [id],
  );
  const fillable = await escrowRead<boolean>(ctx, "isFillable", [id]);
  const base = {
    id,
    maker: value[0] as Address,
    expiresAt: value[1] as bigint,
    status: value[2] as number,
    fillable,
  };
  if (kind === 1)
    return {
      ...base,
      kind: "Ask",
      level: value[3] as number,
      tokenId: value[4] as bigint,
      amount: value[5] as bigint,
      fromTaker: 0n,
      mergeReady: false,
    };
  if (kind === 2)
    return {
      ...base,
      kind: "Bid",
      level: value[3] as number,
      mergeReady: value[4] as boolean,
      amount: value[5] as bigint,
      fromTaker: 0n,
    };
  return {
    ...base,
    kind: "Swap",
    level: value[3] as number,
    mergeReady: value[4] as boolean,
    tokenId: value[6] as bigint,
    wantedTokenId: value[7] as bigint,
    amount: value[8] as bigint,
    fromTaker: value[9] as bigint,
  };
}
export function marketStep(
  ctx: Context,
  fn: string,
  args: readonly unknown[],
  label: string,
  description: string,
): TxStep {
  return {
    label,
    address: ctx.escrow.address,
    abi: ctx.escrowAbi,
    functionName: fn,
    args,
    description,
  };
}
export async function approvals(
  ctx: Context,
  eco: Ecosystem,
  account: Address,
  nftIds: bigint[],
  funds: bigint,
): Promise<TxStep[]> {
  const steps: TxStep[] = [];
  for (const id of nftIds) {
    const [owner, approved, all] = await Promise.all([
      read<Address>(ctx, eco.nft, ctx.abis.SqueekNFT, "ownerOf", [id]),
      read<Address>(ctx, eco.nft, ctx.abis.SqueekNFT, "getApproved", [id]),
      read<boolean>(ctx, eco.nft, ctx.abis.SqueekNFT, "isApprovedForAll", [
        account,
        ctx.escrow.address,
      ]),
    ]);
    if (!same(owner, account))
      throw new Error(
        `Squeek #${id} is not in this wallet. Withdraw deposited Squeeks before trading.`,
      );
    if (!all && !same(approved, ctx.escrow.address))
      steps.push({
        label: `Approve Squeek #${id}`,
        address: eco.nft,
        abi: ctx.abis.SqueekNFT,
        functionName: "approve",
        args: [ctx.escrow.address, id],
        description: `Allow only Squeek #${id} to be transferred by SqueekMatchEscrow. It stays in your wallet until a fill.`,
      });
  }
  if (funds > 0n) {
    const [balance, allowance] = await Promise.all([
      read<bigint>(ctx, eco.token, ctx.abis.SqueekToken, "balanceOf", [
        account,
      ]),
      read<bigint>(ctx, eco.token, ctx.abis.SqueekToken, "allowance", [
        account,
        ctx.escrow.address,
      ]),
    ]);
    if (balance < funds)
      throw new Error("This wallet does not have enough SQK for the order.");
    if (allowance < funds)
      steps.push({
        label: "Approve SQK",
        address: eco.token,
        abi: ctx.abis.SqueekToken,
        functionName: "approve",
        args: [ctx.escrow.address, funds],
        description:
          "Approve only the SQK needed for this action. No unlimited allowance is requested.",
      });
  }
  return steps;
}
export async function supplementary(): Promise<ApiData> {
  const endpoints = [
    "/v1/economy/state",
    "/v1/status",
    "/v1/measurement/stats?range=7d",
    "/v1/events?limit=10",
  ];
  const results = await Promise.allSettled(
    endpoints.map((path) =>
      fetchJson<Record<string, unknown>>(SOURCES.api + path),
    ),
  );
  const data: ApiData = {};
  const names = ["economy", "status", "stats", "events"] as const;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") data[names[i]] = r.value;
    else
      data.error =
        "Some API display data is unavailable. Contract reads are independent.";
  });
  return data;
}
export function derivePace(data: ApiData): number | null {
  // API identity is checked by the caller; an observation is an estimate, never a cooldown guarantee.
  const events = data.events?.events as
    | {
        type: string;
        occurredAt: string;
        payload?: { completedBlockCount?: string };
      }[]
    | undefined;
  const settlements = events?.filter(
    (e) =>
      e.type === "system.settlement_completed" &&
      e.payload?.completedBlockCount,
  );
  if (!settlements || settlements.length < 2) return null;
  const newest = Date.parse(settlements[0].occurredAt),
    oldest = Date.parse(settlements.at(-1)!.occurredAt);
  const blocks = settlements
    .slice(0, -1)
    .reduce((sum, e) => sum + Number(e.payload!.completedBlockCount), 0);
  const days = (newest - oldest) / 86400000;
  return days > 0 && blocks > 0 ? blocks / days : null;
}
export function fillsLabel(event: IndexedEvent) {
  return `${event.name.replace("Filled", "")} #${event.args.askId ?? event.args.bidId ?? event.args.swapId}`;
}
export const checksum = (address: string) => getAddress(address.toLowerCase());
