import { test, expect } from "@playwright/test";
import {
  addressValue,
  positiveId,
  sqk,
  planChains,
  errorText,
  amount,
} from "../src/domain";
import { reconstructHolders } from "../src/indexer";
import { docs, A, B, SQK } from "./mock-chain";
import type { Policy, IndexedEvent } from "../src/types";
const policy: Policy = {
  nft: docs.contracts.SqueekNFT.address,
  maxSupply: 9999,
  maximumLevel: 10,
  levels: docs.squeeksPolicy.levels.map(
    (l: { weight: number; cooldownBlocks: number }) => ({
      weight: BigInt(l.weight),
      cooldownBlocks: BigInt(l.cooldownBlocks),
    }),
  ),
};
test("SQK parser preserves every base unit and rejects extra decimals, negative and zero input", () => {
  expect(sqk("0.000000000000000001", 18)).toBe(1n);
  expect(sqk("9007199254740993.123456789012345678", 18)).toBe(
    9007199254740993123456789012345678n,
  );
  for (const input of ["1.0000000000000000001", "-2", "NaN", "0", "1e9"])
    expect(() => sqk(input, 18)).toThrow();
  expect(sqk("0", 18, true)).toBe(0n);
  expect(amount(SQK("1234.5678"))).toBe("1,234.5678");
  expect(amount(1n)).toBe("0.000000000000000001");
  expect(amount(-1n)).toBe("-0.000000000000000001");
});
test("IDs and address entry validate without guessing or ENS on an unsupported chain", () => {
  expect(positiveId(" 9999 ")).toBe(9999n);
  for (const v of ["0", "-1", "1.2", "0x2"])
    expect(() => positiveId(v)).toThrow();
  expect(addressValue(" " + A + " ").toLowerCase()).toBe(A);
  expect(() => addressValue("example.eth")).toThrow();
});
test("planner buys one L1 and carries merges up to L3 without assuming API power", () => {
  const plans = planChains(
    [3, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    policy,
    Array(10).fill(SQK("20")),
    1,
  );
  expect(plans[0].buys[0]).toBe(1);
  expect(plans[0].purchases).toBe(1);
  expect(plans[0].merges).toEqual([
    { level: 1, count: 2 },
    { level: 2, count: 1 },
  ]);
  expect(plans[0].gain).toBe(3000n);
  expect(plans[0].final.slice(0, 3)).toEqual([0, 1, 1]);
  expect(plans[0].cost).toBe(SQK("20"));
});
test("planner treats unknown price as unknown and respects maximum level", () => {
  const plans = planChains(
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    policy,
    Array(10).fill(null),
    1,
  );
  expect(plans[0].cost).toBeNull();
  expect(
    plans.every((p) => p.buys[9] === 0 && p.merges.every((m) => m.level < 10)),
  ).toBe(true);
});
test("event reconstruction applies transfers and a merge without double-counting a burned donor", () => {
  const e = (name: string, args: IndexedEvent["args"]): IndexedEvent => ({
    name,
    args,
    block: "1",
    logIndex: 1,
    tx: "test-only",
  });
  const transfers = [
    e("Transfer", { tokenId: "1", from: A, to: B }),
    e("Transfer", { tokenId: "2", from: A, to: B }),
    e("Transfer", { tokenId: "3", from: A, to: B }),
    e("Transfer", { tokenId: "2", from: B, to: "0x" + "0".repeat(40) }),
  ];
  const mining = [
    e("PositionsMerged", {
      collection: 0,
      survivor: "1",
      donor: "2",
      level: 2,
    }),
  ];
  const result = reconstructHolders(transfers, mining);
  expect(result.map((r) => r.level).sort()).toEqual([1, 2]);
  expect(result.some((r) => r.id === 2n)).toBe(false);
});
test("nested contract and wallet failures translate to recoverable language", () => {
  expect(
    errorText({ cause: { data: { errorName: "PowerChangePending" } } }),
  ).toContain("power change");
  expect(errorText({ code: 4001 })).toContain("declined");
  expect(errorText(new Error("insufficient funds"))).toContain("Sepolia ETH");
});
