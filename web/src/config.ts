import { createConfig, fallback, http } from "wagmi";
import { injected } from "wagmi/connectors/injected";
import { coinbaseWallet } from "wagmi/connectors/coinbaseWallet";
import {
  createPublicClient,
  defineChain,
  keccak256,
  toBytes,
  type Abi,
} from "viem";
import type { Context, Deployment } from "./types";
export const SOURCES = {
  api: "https://api.squeekchain.com",
  deployments: "https://docs.squeekchain.com/assets/deployments/sepolia.json",
  docs: "https://docs.squeekchain.com",
};
export const OPEN_IN = [
  {
    id: "metamask",
    name: "MetaMask",
    href: (url: string) =>
      `https://link.metamask.io/dapp/${url.replace(/^https?:\/\//, "")}`,
  },
  {
    id: "coinbase",
    name: "Coinbase Wallet",
    href: (url: string) =>
      `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}`,
  },
  {
    id: "rabby",
    name: "Rabby",
    href: (url: string) =>
      `https://go.rabby.io/mobile/?_cmd=open-dapp&dapp=${encodeURIComponent(url)}`,
  },
  {
    id: "phantom",
    name: "Phantom",
    href: (url: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`,
  },
];
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  return value;
}
export const canonicalHash = (value: unknown) =>
  keccak256(toBytes(JSON.stringify(canonical(value)))).slice(2);
export async function fetchJson<T>(url: string, timeout = 12000): Promise<T> {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(timeout),
    cache: "no-store",
  });
  if (!r.ok)
    throw new Error(
      `Unable to load ${new URL(url, location.href).pathname} (HTTP ${r.status}). Try again.`,
    );
  return r.json() as Promise<T>;
}
export async function loadContext(): Promise<Context> {
  const deployment = await fetchJson<Deployment>("./imd-deployment.json");
  const allowed = [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    "network",
    "walletAddChain",
    "poolKey",
  ];
  if (
    deployment.version !== 1 ||
    Object.keys(deployment).some((k) => !allowed.includes(k)) ||
    !deployment.network?.testnet ||
    deployment.network.chainId !== deployment.chainId ||
    deployment.network.name !== "Sepolia"
  )
    throw new Error(
      "This export requires a valid attested Sepolia deployment.",
    );
  const escrow = deployment.contracts.find(
    (c) => c.name === "SqueekMatchEscrow",
  );
  if (!escrow) throw new Error("The attested SqueekMatchEscrow is missing.");
  const loaded = await Promise.all(
    deployment.contracts.map(async (c) => {
      if (
        !/^[\w/.-]+$/.test(c.abiPath) ||
        c.abiPath.includes("..") ||
        c.abiPath.startsWith("/")
      )
        throw new Error("Unsafe ABI path.");
      const abi = await fetchJson<Abi>(`./${c.abiPath}`);
      if (!Array.isArray(abi) || canonicalHash(abi) !== c.abiHash)
        throw new Error(`ABI integrity check failed for ${c.name}.`);
      return [c.name, abi] as const;
    }),
  );
  // Every ABI used at runtime is a local JSON asset. Only the escrow ABI is attested by this launch.
  const names = ["SqueekNFT", "SqueekMining", "SqueekCore", "SqueekToken"];
  const external = await Promise.all(
    names.map(
      async (name) =>
        [name, await fetchJson<Abi>(`./official/${name}.json`)] as const,
    ),
  );
  const [docs, provenance] = await Promise.all([
    fetchJson<Context["docs"]>("./official/sepolia.json"),
    fetchJson<Context["provenance"]>("./official/provenance.json"),
  ]);
  const chain = makeChain(deployment);
  const client = createPublicClient({
    chain,
    transport: fallback(
      deployment.network.rpcUrls.map((url) =>
        http(url, {
          timeout: 8000,
          retryCount: 0,
          batch: { batchSize: 30, wait: 20 },
        }),
      ),
      { rank: false, retryCount: 0 },
    ),
  });
  return {
    deployment,
    escrow,
    escrowAbi: Object.fromEntries(loaded)[escrow.name],
    abis: Object.fromEntries(external),
    docs,
    provenance,
    client,
  };
}
export function makeChain(d: Deployment) {
  return defineChain({
    id: d.chainId,
    name: d.network.name,
    nativeCurrency: d.network.nativeCurrency,
    rpcUrls: { default: { http: d.network.rpcUrls } },
    blockExplorers: { default: { name: "Explorer", url: d.network.explorer } },
    testnet: d.network.testnet,
  });
}
export function makeWagmi(d: Deployment) {
  const chain = makeChain(d);
  return createConfig({
    chains: [chain],
    multiInjectedProviderDiscovery: true,
    connectors: [
      injected(),
      coinbaseWallet({
        appName: "SqueekMatch",
        preference: { options: "all" },
      }),
    ],
    transports: {
      [chain.id]: fallback(
        d.network.rpcUrls.map((url) =>
          http(url, { timeout: 8000, retryCount: 0 }),
        ),
        { rank: false },
      ),
    },
  });
}
export async function switchProvider(
  provider: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  },
  d: Deployment,
) {
  const params = [{ chainId: `0x${d.chainId.toString(16)}` }];
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params });
  } catch (e) {
    const error = e as {
      code?: number;
      message?: string;
      cause?: { code?: number };
    };
    if (
      (error.code === 4902 ||
        error.cause?.code === 4902 ||
        /unknown chain|unrecognized chain|not.*added/i.test(
          error.message ?? "",
        )) &&
      d.walletAddChain
    ) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [d.walletAddChain],
      });
      await provider.request({ method: "wallet_switchEthereumChain", params });
    } else throw e;
  }
}
