import type { Abi, Address, PublicClient } from "viem";
export type Contract = {
  name: string;
  address: Address;
  abiHash: string;
  abiPath: string;
};
export type Network = {
  chainId: number;
  name: string;
  testnet: boolean;
  rpcUrls: string[];
  explorer: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  faucets: string[];
  uniswapV4: Record<string, string | boolean>;
};
export type Deployment = {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: Contract[];
  assets: { path: string; sha256: string }[];
  network: Network;
  walletAddChain?: {
    chainId: `0x${string}`;
    chainName: string;
    rpcUrls: readonly string[];
    nativeCurrency: Network["nativeCurrency"];
    blockExplorerUrls: readonly string[];
  };
};
export type DocsDeployment = {
  chainId: number;
  deploymentBlock: number;
  sourceRevision: string;
  contracts: Record<
    string,
    {
      address: Address;
      abi: string;
      implementationRuntimeHash?: string;
      implementation?: Address;
    }
  >;
};
export type Position = {
  activeWeight: bigint;
  pendingWeight: bigint;
  pendingRound: number;
  nextMergeBlock: number;
  level: number;
  lastIndex: bigint;
  accruedScaled: bigint;
};
export type Policy = {
  nft: Address;
  maxSupply: number;
  maximumLevel: number;
  levels: { weight: bigint; cooldownBlocks: bigint }[];
};
export type CoreState = {
  blockHeight: bigint;
  cumulativeWork: bigint;
  settledThroughRound: bigint;
  cumulativeBlockUnits: bigint;
  blockProgress: bigint;
  workPerThousandBlocks: number;
  authorizationNonce: bigint;
  paused: boolean;
};
export type MiningState = {
  totalWeight: bigint;
  processedThroughRound: bigint;
  closedThroughBlock: bigint;
};
export type Ecosystem = {
  nft: Address;
  token: Address;
  mining: Address;
  core: Address;
  decimals: number;
  symbol: string;
  policy: Policy;
  state: CoreState;
  totalWeight: bigint;
  rewardPerBlock: bigint;
  blockNumber: bigint;
};
export type IdentityRow = {
  label: string;
  expected?: string;
  actual?: string;
  ok: boolean;
};
export type Verification = {
  ok: boolean;
  status: "checking" | "verified" | "mismatch" | "unavailable";
  message: string;
  rows: IdentityRow[];
  checkedAt?: number;
  ecosystem?: Ecosystem;
};
export type Squeek = {
  id: bigint;
  owner: Address;
  position: Position;
  claimable: bigint | null;
  deposited: boolean;
};
export type Kind = "Ask" | "Bid" | "Swap";
export type Order = {
  id: bigint;
  kind: Kind;
  maker: Address;
  expiresAt: bigint;
  status: number;
  level: number;
  tokenId?: bigint;
  wantedTokenId?: bigint;
  amount: bigint;
  fromTaker: bigint;
  mergeReady: boolean;
  fillable: boolean;
};
export type IndexedEvent = {
  name: string;
  args: Record<string, string | boolean | number>;
  block: string;
  logIndex: number;
  tx: string;
};
export type IndexResult = {
  events: IndexedEvent[];
  through: bigint;
  from: bigint;
  cached: boolean;
};
export type ApiData = {
  economy?: Record<string, unknown>;
  status?: Record<string, unknown>;
  stats?: Record<string, unknown>;
  events?: Record<string, unknown>;
  error?: string;
};
export type Context = {
  deployment: Deployment;
  escrow: Contract;
  escrowAbi: Abi;
  abis: Record<string, Abi>;
  docs: DocsDeployment;
  provenance: { escrowDeploymentBlock: number; retrievedAt: string };
  client: PublicClient;
};
export type TxStep = {
  label: string;
  address: Address;
  abi: Abi;
  functionName: string;
  args: readonly unknown[];
  description: string;
};
export type TxPlan = {
  title: string;
  description: string;
  steps: TxStep[];
  requiresIdentity?: boolean;
  receivedToken?: bigint;
  onSuccess?: () => void;
};
