// Deliberate test doubles. These are never bundled or copied into dist and never reach a real RPC.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeEventTopics,
  encodeAbiParameters,
  encodeErrorResult,
  toHex,
  parseUnits,
  type Abi,
  type AbiEvent,
  type Address,
  type Hex,
} from "viem";
import type { Page } from "@playwright/test";
const root = resolve(import.meta.dirname, "..");
export const docs = JSON.parse(
  readFileSync(resolve(root, "public/official/sepolia.json"), "utf8"),
);
export const handoff = JSON.parse(
  readFileSync(resolve(root, "deployment-handoff.json"), "utf8"),
);
const abiNames = ["SqueekNFT", "SqueekMining", "SqueekToken", "SqueekCore"];
export const abis: Record<string, Abi> = Object.fromEntries(
  abiNames.map((n) => [
    n,
    JSON.parse(
      readFileSync(resolve(root, `public/official/${n}.json`), "utf8"),
    ),
  ]),
);
abis.SqueekMatchEscrow = JSON.parse(
  readFileSync(resolve(root, "public/abi/SqueekMatchEscrow.json"), "utf8"),
);
export const A = "0x83a8d3e5ed02e5201a996c3f03e017b6a6c19d31" as Address; // documented governance Safe, used only as mock holder
export const B = "0x598958abf7d8db8dd468cb53dd6ba705581bff54" as Address; // public API holder
const addresses: Record<string, Address> = Object.fromEntries(
  abiNames.map((n) => [n, docs.contracts[n].address]),
);
addresses.SqueekMatchEscrow = handoff.contracts[0].address;
export const SQK = (value: string) => parseUnits(value, 18);
export type MockOrder = {
  kind: number;
  maker: Address;
  expiresAt: bigint;
  status: number;
  level: number;
  tokenId?: bigint;
  amount: bigint;
  mergeReady?: boolean;
  fromTaker?: bigint;
  wantedTokenId?: bigint;
};
export type MockState = {
  mismatch: boolean;
  apiUnavailable: boolean;
  noCode: boolean;
  unknownChain: boolean;
  rejectWallet: boolean;
  revert: boolean;
  receiptDelay: number;
  allowance: bigint;
  approved: Set<string>;
  orders: Map<bigint, MockOrder>;
  tokens: Map<
    bigint,
    {
      owner: Address;
      level: number;
      pendingRound: number;
      nextMergeBlock: number;
    }
  >;
  transactions: {
    functionName: string;
    args: readonly unknown[];
    to: string;
  }[];
  calls: { method: string; params: unknown }[];
  rpcCalls: string[];
  logCalls: number;
  failLogs: boolean;
  next: bigint;
  block: bigint;
};
function defaults(): MockState {
  return {
    mismatch: false,
    apiUnavailable: false,
    noCode: false,
    unknownChain: false,
    rejectWallet: false,
    revert: false,
    receiptDelay: 0,
    allowance: 0n,
    approved: new Set(),
    next: 5n,
    block: 12051500n,
    logCalls: 0,
    failLogs: false,
    calls: [],
    transactions: [],
    rpcCalls: [],
    orders: new Map([
      [
        1n,
        {
          kind: 1,
          maker: B,
          expiresAt: BigInt(Math.floor(Date.now() / 1000) + 604800),
          status: 1,
          level: 1,
          tokenId: 5n,
          amount: SQK("20"),
        },
      ],
      [
        2n,
        {
          kind: 2,
          maker: A,
          expiresAt: BigInt(Math.floor(Date.now() / 1000) + 604800),
          status: 1,
          level: 1,
          amount: SQK("18"),
          mergeReady: true,
        },
      ],
      [
        3n,
        {
          kind: 3,
          maker: B,
          expiresAt: BigInt(Math.floor(Date.now() / 1000) + 604800),
          status: 1,
          level: 1,
          tokenId: 6n,
          amount: SQK("3"),
          fromTaker: 0n,
          mergeReady: true,
          wantedTokenId: 0n,
        },
      ],
      [
        4n,
        {
          kind: 1,
          maker: A,
          expiresAt: BigInt(Math.floor(Date.now() / 1000) + 604800),
          status: 1,
          level: 1,
          tokenId: 1n,
          amount: SQK("25"),
        },
      ],
    ]),
    tokens: new Map(
      [1n, 2n, 3n, 4n, 5n, 6n].map((id) => [
        id,
        {
          owner: id <= 4n ? A : B,
          level: id === 4n ? 2 : 1,
          pendingRound: 0,
          nextMergeBlock: 0,
        },
      ]),
    ),
  };
}
function valueForType(type: string): unknown {
  if (type.endsWith("[]")) return [];
  if (type === "bool") return false;
  if (type === "address") return A;
  if (type.startsWith("bytes"))
    return type === "bytes32" ? "0x" + "11".repeat(32) : "0x";
  if (type === "string") return "";
  return 0n;
}
function tupleResult(abi: Abi, fn: string, values: Record<string, unknown>) {
  const f = abi.find((x) => x.type === "function" && x.name === fn) as {
    outputs: { components: { name: string; type: string }[] }[];
  };
  return Object.fromEntries(
    f.outputs[0].components.map((c) => [
      c.name,
      values[c.name] ?? valueForType(c.type),
    ]),
  );
}
function blockHash(n: bigint) {
  return ("0x" + n.toString(16).padStart(64, "0")) as Hex;
}
function eventLog(
  name: string,
  abi: Abi,
  address: Address,
  args: Record<string, unknown>,
  index: number,
  block = 12051420n,
) {
  const event = abi.find(
    (x) => x.type === "event" && x.name === name,
  ) as AbiEvent;
  const topics = encodeEventTopics({ abi: [event], eventName: name, args });
  const unindexed = event.inputs.filter((x) => !x.indexed);
  return {
    address,
    topics,
    data: encodeAbiParameters(
      unindexed,
      unindexed.map((x) => args[x.name!]),
    ),
    blockNumber: toHex(block),
    blockHash: blockHash(block),
    transactionHash: blockHash(BigInt(index + 500)),
    transactionIndex: "0x0",
    logIndex: toHex(index),
    removed: false,
  };
}
function logsFor(state: MockState, address: string) {
  const out: ReturnType<typeof eventLog>[] = [];
  if (address.toLowerCase() === addresses.SqueekNFT.toLowerCase()) {
    for (const [id, t] of state.tokens)
      out.push(
        eventLog(
          "Transfer",
          abis.SqueekNFT,
          addresses.SqueekNFT,
          { from: "0x" + "0".repeat(40), to: t.owner, tokenId: id },
          Number(id),
          11902290n,
        ),
      );
  } else if (address.toLowerCase() === addresses.SqueekMining.toLowerCase()) {
    out.push(
      eventLog(
        "PositionsMerged",
        abis.SqueekMining,
        addresses.SqueekMining,
        {
          collection: 0,
          survivor: 4n,
          donor: 9n,
          level: 2,
          effectiveRound: 8n,
          nextMergeBlock: 0n,
          activeWeight: 3000n,
          pendingWeight: 0n,
          accruedScaled: 0n,
        },
        50,
        11902300n,
      ),
    );
  } else {
    for (const [id, o] of state.orders) {
      const name = o.kind === 1 ? "Ask" : o.kind === 2 ? "Bid" : "Swap";
      const args =
        o.kind === 1
          ? {
              askId: id,
              maker: o.maker,
              tokenId: o.tokenId,
              level: o.level,
              price: o.amount,
              expiresAt: o.expiresAt,
            }
          : o.kind === 2
            ? {
                bidId: id,
                maker: o.maker,
                level: o.level,
                mergeReady: o.mergeReady,
                amount: o.amount,
                expiresAt: o.expiresAt,
              }
            : {
                swapId: id,
                maker: o.maker,
                makerTokenId: o.tokenId,
                makerLevel: o.level,
                wantedTokenId: o.wantedTokenId ?? 0n,
                wantedLevel: o.level,
                mergeReady: o.mergeReady,
                sqkFromMaker: o.amount,
                sqkFromTaker: o.fromTaker ?? 0n,
                expiresAt: o.expiresAt,
              };
      out.push(
        eventLog(
          name + "Created",
          abis.SqueekMatchEscrow,
          addresses.SqueekMatchEscrow,
          args,
          Number(id),
        ),
      );
    }
  }
  return out;
}
function decode(to: string, data: Hex) {
  const name = Object.keys(addresses).find(
    (n) => addresses[n].toLowerCase() === to.toLowerCase(),
  );
  if (!name) throw new Error("Mock received an unknown contract " + to);
  return {
    name,
    abi: abis[name],
    ...decodeFunctionData({ abi: abis[name], data }),
  };
}
function readValue(
  state: MockState,
  name: string,
  fn: string,
  args: readonly unknown[],
): unknown {
  const id = BigInt(String(args[0] ?? 0));
  const token = state.tokens.get(BigInt(String(args[1] ?? 0)));
  if (name === "SqueekMatchEscrow") {
    if (fn === "SQUEEK") return addresses.SqueekNFT;
    if (fn === "SQK") return addresses.SqueekToken;
    if (fn === "mining") return addresses.SqueekMining;
    if (fn === "nextOrderId") return state.next;
    if (fn === "kindOf") return state.orders.get(id)?.kind ?? 0;
    if (fn === "isOpen" || fn === "isFillable") {
      const o = state.orders.get(id);
      return (
        o?.status === 1 && o.expiresAt > BigInt(Math.floor(Date.now() / 1000))
      );
    }
    if (fn === "isMergeReady") {
      const t = state.tokens.get(id);
      return (
        !!t && t.level < 10 && t.pendingRound === 0 && t.nextMergeBlock <= 1000
      );
    }
    if (fn === "levelOf") return state.tokens.get(id)?.level ?? 0;
    if (fn === "tradeCount") return 0n;
    if (fn === "DEFAULT_DURATION") return 604800n;
    if (fn === "MAX_DURATION") return 2592000n;
    const o = state.orders.get(id)!;
    if (fn === "asks")
      return [o.maker, o.expiresAt, o.status, o.level, o.tokenId, o.amount, 0n];
    if (fn === "bids")
      return [
        o.maker,
        o.expiresAt,
        o.status,
        o.level,
        o.mergeReady ?? false,
        o.amount,
      ];
    if (fn === "swaps")
      return [
        o.maker,
        o.expiresAt,
        o.status,
        o.level,
        o.mergeReady ?? false,
        o.level,
        o.tokenId,
        o.wantedTokenId ?? 0n,
        o.amount,
        o.fromTaker ?? 0n,
        0n,
      ];
  }
  if (name === "SqueekNFT") {
    if (fn === "mining") return addresses.SqueekMining;
    if (fn === "ownerOf") return state.tokens.get(id)?.owner ?? B;
    if (fn === "balanceOf")
      return BigInt(
        [...state.tokens.values()].filter(
          (t) => t.owner.toLowerCase() === String(args[0]).toLowerCase(),
        ).length,
      );
    if (fn === "getApproved")
      return state.approved.has(String(id)) ? addresses.SqueekMatchEscrow : A;
    if (fn === "isApprovedForAll") return false;
    if (fn === "symbol") return "SQUEEK";
    if (fn === "name") return "Squeek";
  }
  if (name === "SqueekToken") {
    if (fn === "decimals") return 18;
    if (fn === "symbol") return "SQK";
    if (fn === "balanceOf") return SQK("1000000");
    if (fn === "allowance") return state.allowance;
  }
  if (name === "SqueekMining") {
    if (fn === "core") return addresses.SqueekCore;
    if (fn === "REWARD_PER_BLOCK") return SQK("1000");
    if (fn === "claimable") return SQK("12.5");
    if (fn === "position")
      return tupleResult(abis.SqueekMining, fn, {
        activeWeight: token?.level === 2 ? 3000n : 1000n,
        pendingWeight: token?.pendingRound ? 7000n : 0n,
        pendingRound: token?.pendingRound ?? 0,
        nextMergeBlock: token?.nextMergeBlock ?? 0,
        level: token?.level ?? 0,
      });
    if (fn === "collectionPolicy")
      return {
        nft: addresses.SqueekNFT,
        maxSupply: 9999,
        maximumLevel: 10,
        levels: docs.squeeksPolicy.levels.map(
          (l: { weight: number; cooldownBlocks: number }) => ({
            weight: BigInt(l.weight),
            cooldownBlocks: BigInt(l.cooldownBlocks),
          }),
        ),
      };
    if (fn === "configuration")
      return tupleResult(abis.SqueekMining, fn, {
        core: addresses.SqueekCore,
        token: addresses.SqueekToken,
        genesisCollection: addresses.SqueekNFT,
      });
    if (fn === "state")
      return tupleResult(abis.SqueekMining, fn, {
        totalWeight: 1000000n,
        processedThroughRound: 100n,
        closedThroughBlock: 1000n,
      });
  }
  if (name === "SqueekCore" && fn === "state")
    return tupleResult(abis.SqueekCore, fn, {
      blockHeight: 1000n,
      settledThroughRound: 100n,
      paused: false,
    });
  throw new Error("Mock missing " + name + "." + fn);
}
function applyTransaction(state: MockState, to: string, data: Hex) {
  const decoded = decode(to, data);
  const fn = decoded.functionName;
  const args = decoded.args ?? [];
  state.transactions.push({ functionName: fn, args, to });
  if (fn === "approve") {
    if (decoded.name === "SqueekToken")
      state.allowance = BigInt(String(args[1]));
    else state.approved.add(String(args[1]));
  }
  if (fn.startsWith("create")) {
    const id = state.next++;
    const expiresAt =
      BigInt(Math.floor(Date.now() / 1000)) + BigInt(String(args.at(-1))) ||
      604800n;
    if (fn === "createAsk")
      state.orders.set(id, {
        kind: 1,
        maker: A,
        expiresAt,
        status: 1,
        level: state.tokens.get(BigInt(String(args[0])))?.level ?? 1,
        tokenId: BigInt(String(args[0])),
        amount: BigInt(String(args[1])),
      });
    if (fn === "createBid")
      state.orders.set(id, {
        kind: 2,
        maker: A,
        expiresAt: BigInt(Math.floor(Date.now() / 1000)) + 604800n,
        status: 1,
        level: Number(args[0]),
        mergeReady: Boolean(args[1]),
        amount: BigInt(String(args[2])),
      });
    if (fn === "createSwap")
      state.orders.set(id, {
        kind: 3,
        maker: A,
        expiresAt,
        status: 1,
        level: Number(args[2]),
        mergeReady: Boolean(args[3]),
        tokenId: BigInt(String(args[0])),
        wantedTokenId: BigInt(String(args[1])),
        amount: BigInt(String(args[4])),
        fromTaker: BigInt(String(args[5])),
      });
  }
  if (fn.startsWith("fill")) {
    const o = state.orders.get(BigInt(String(args[0])))!;
    o.status = 2;
    if (o.kind === 1 || o.kind === 3) {
      const t = state.tokens.get(o.tokenId!)!;
      t.owner = A;
    }
    if (o.kind === 2 || o.kind === 3)
      state.tokens.get(BigInt(String(args[1])))!.owner = o.maker;
  }
  if (fn.startsWith("cancel"))
    state.orders.get(BigInt(String(args[0])))!.status = 3;
  if (fn === "merge") {
    const s = state.tokens.get(BigInt(String(args[1])))!;
    s.level++;
    s.pendingRound = 101;
    s.nextMergeBlock = 1004;
    state.tokens.delete(BigInt(String(args[2])));
  }
  return blockHash(10000n + BigInt(state.transactions.length));
}
export async function setupMock(
  page: Page,
  options: Partial<MockState> & { wallet?: boolean; chain?: number } = {},
) {
  const state = Object.assign(defaults(), options);
  const receipts = new Map<string, unknown>();
  await page.route("https://docs.squeekchain.com/**", (route) =>
    route.fulfill({ json: docs }),
  );
  await page.route("https://api.squeekchain.com/**", async (route) => {
    const url = new URL(route.request().url());
    if (state.apiUnavailable)
      return route.fulfill({ status: 503, json: { error: "unavailable" } });
    const identities = {
      token: state.mismatch ? addresses.SqueekCore : addresses.SqueekToken,
      core: addresses.SqueekCore,
      mining: { proxy: addresses.SqueekMining },
    };
    if (url.pathname.includes("/accounts/"))
      return route.fulfill({
        json: { status: "available", identities, tokens: [], nextCursor: null },
      });
    if (url.pathname.includes("/squeeks/"))
      return route.fulfill({
        json: {
          status: "available",
          identities,
          custody: { owner: A, depositor: null },
        },
      });
    if (url.pathname === "/v1/events")
      return route.fulfill({
        json: {
          identities,
          events: [
            {
              type: "system.settlement_completed",
              occurredAt: "2026-11-02T20:00:00Z",
              payload: { completedBlockCount: "40" },
            },
            {
              type: "system.settlement_completed",
              occurredAt: "2026-11-02T19:50:00Z",
              payload: { completedBlockCount: "40" },
            },
          ],
        },
      });
    return route.fulfill({
      json: {
        status: "available",
        chain: { chainId: "11155111" },
        identities,
        asset: { address: identities.token },
      },
    });
  });
  async function rpc(body: { id: number; method: string; params: unknown[] }) {
    state.rpcCalls.push(body.method);
    try {
      let result: unknown;
      const p = body.params;
      if (body.method === "eth_chainId") result = "0xaa36a7";
      else if (body.method === "eth_blockNumber") result = toHex(state.block);
      else if (body.method === "eth_getCode")
        result = state.noCode ? "0x" : "0x60806040";
      else if (body.method === "eth_getBalance") result = toHex(SQK("2"));
      else if (body.method === "eth_call") {
        const call = p[0] as { to: string; data: Hex };
        const d = decode(call.to, call.data);
        const f = d.abi.find(
          (x) => x.type === "function" && x.name === d.functionName,
        ) as { stateMutability: string };
        if (f.stateMutability !== "view" && f.stateMutability !== "pure") {
          if (state.revert)
            return {
              jsonrpc: "2.0",
              id: body.id,
              error: {
                code: 3,
                message: "execution reverted",
                data: encodeErrorResult({
                  abi: abis.SqueekMatchEscrow,
                  errorName: "OrderNotOpen",
                  args: [1n],
                }),
              },
            };
          result = encodeFunctionResult({
            abi: d.abi,
            functionName: d.functionName,
            result: d.functionName.startsWith("create")
              ? state.next
              : d.name === "SqueekToken" && d.functionName === "approve"
                ? true
                : d.functionName === "claim"
                  ? SQK("25")
                  : undefined,
          });
        } else
          result = encodeFunctionResult({
            abi: d.abi,
            functionName: d.functionName,
            result: readValue(state, d.name, d.functionName, d.args ?? []),
          });
      } else if (body.method === "eth_getLogs") {
        state.logCalls++;
        if (state.failLogs) throw new Error("Mock RPC log range unavailable");
        const filter = p[0] as {
          address: string;
          fromBlock: string;
          toBlock: string;
        };
        result = logsFor(state, filter.address).filter(
          (l) =>
            BigInt(l.blockNumber) >= BigInt(filter.fromBlock) &&
            BigInt(l.blockNumber) <= BigInt(filter.toBlock),
        );
      } else if (body.method === "eth_getTransactionReceipt") {
        if (state.receiptDelay)
          await new Promise((r) => setTimeout(r, state.receiptDelay));
        result = receipts.get(String(p[0])) ?? null;
      } else if (body.method === "eth_getBlockByNumber")
        result = {
          number: toHex(state.block),
          hash: blockHash(state.block),
          timestamp: toHex(Math.floor(Date.now() / 1000)),
          transactions: [],
          baseFeePerGas: "0x1",
          gasLimit: "0x1c9c380",
          gasUsed: "0x0",
          parentHash: blockHash(state.block - 1n),
        };
      else if (body.method === "eth_getTransactionCount") result = "0x0";
      else throw new Error("Unexpected RPC method " + body.method);
      return { jsonrpc: "2.0", id: body.id, result };
    } catch (e) {
      return {
        jsonrpc: "2.0",
        id: body.id,
        error: {
          code: -32000,
          message: e instanceof Error ? e.message : String(e),
        },
      };
    }
  }
  await page.route(
    /https:\/\/(ethereum-sepolia-rpc\.publicnode\.com|rpc\.sepolia\.ethpandaops\.io|sepolia\.rpc\.sentio\.xyz)\/?$/,
    async (route) => {
      const data = route.request().postDataJSON();
      const response = Array.isArray(data)
        ? await Promise.all(data.map(rpc))
        : await rpc(data);
      await route.fulfill({ json: response });
    },
  );
  await page.route("**/__mock_submit", async (route) => {
    const request = route.request().postDataJSON();
    state.calls.push(request);
    if (request.method === "eth_sendTransaction") {
      const tx = request.params[0] as { to: string; data: Hex };
      const hash = applyTransaction(state, tx.to, tx.data);
      receipts.set(hash, {
        transactionHash: hash,
        transactionIndex: "0x0",
        blockHash: blockHash(state.block),
        blockNumber: toHex(state.block),
        from: A,
        to: tx.to,
        cumulativeGasUsed: "0x5208",
        gasUsed: "0x5208",
        contractAddress: null,
        logs: [],
        logsBloom: "0x" + "00".repeat(256),
        status: "0x1",
        effectiveGasPrice: "0x1",
        type: "0x2",
      });
      return route.fulfill({ json: { result: hash } });
    }
    return route.fulfill({
      json: { result: true, reject: state.rejectWallet },
    });
  });
  if (options.wallet !== false)
    await page.addInitScript(
      ({ account, initialChain, unknownChain }) => {
        let chain = initialChain;
        let known = !unknownChain;
        let authorized = false;
        const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
        const calls: { method: string; params?: unknown }[] = [];
        const provider = {
          isMetaMask: false,
          on: (name: string, listener: (...args: unknown[]) => void) => {
            const list = listeners.get(name) ?? new Set();
            list.add(listener);
            listeners.set(name, list);
          },
          removeListener: (
            name: string,
            listener: (...args: unknown[]) => void,
          ) => listeners.get(name)?.delete(listener),
          request: async ({
            method,
            params,
          }: {
            method: string;
            params?: unknown[];
          }) => {
            calls.push({ method, params });
            (window as unknown as { __walletCalls: unknown }).__walletCalls =
              calls;
            if (method === "eth_chainId") return "0x" + chain.toString(16);
            if (method === "eth_accounts" || method === "eth_requestAccounts") {
              if (method === "eth_requestAccounts") {
                const r = await fetch("/__mock_submit", {
                  method: "POST",
                  body: JSON.stringify({ method, params }),
                });
                if ((await r.json()).reject)
                  throw Object.assign(new Error("User rejected request"), {
                    code: 4001,
                  });
                authorized = true;
              }
              return authorized ? [account] : [];
            }
            if (method === "wallet_getCapabilities") return {};
            if (
              method === "wallet_requestPermissions" ||
              method === "wallet_getPermissions"
            )
              return authorized ? [{ parentCapability: "eth_accounts" }] : [];
            if (method === "wallet_switchEthereumChain") {
              if (!known)
                throw Object.assign(new Error("Unknown chain"), { code: 4902 });
              chain = Number((params![0] as { chainId: string }).chainId);
              listeners
                .get("chainChanged")
                ?.forEach((l) => l("0x" + chain.toString(16)));
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              known = true;
              return null;
            }
            if (method === "eth_sendTransaction") {
              const r = await fetch("/__mock_submit", {
                method: "POST",
                body: JSON.stringify({ method, params }),
              });
              return (await r.json()).result;
            }
            throw new Error("Unexpected wallet method " + method);
          },
        };
        Object.defineProperty(window, "ethereum", {
          value: provider,
          configurable: true,
        });
        const announce = () =>
          window.dispatchEvent(
            new CustomEvent("eip6963:announceProvider", {
              detail: {
                info: {
                  uuid: "246ab678-5ab2-4fcf-9a0a-70fcfcaa65aa",
                  name: "Mock Squeek Wallet",
                  icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
                  rdns: "test.squeek.wallet",
                },
                provider,
              },
            }),
          );
        window.addEventListener("eip6963:requestProvider", announce);
        announce();
      },
      {
        account: A,
        initialChain: options.chain ?? 11155111,
        unknownChain: state.unknownChain,
      },
    );
  return state;
}
