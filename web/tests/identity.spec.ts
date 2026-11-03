import { test, expect } from "@playwright/test";
import { setupMock, docs, handoff, A, type MockState } from "./mock-chain";

for (const graphFault of [
  "escrow-nft",
  "escrow-sqk",
  "escrow-mining",
  "nft-mining",
  "mining-core",
  "mining-token",
  "mining-nft",
  "config-core",
  "policy-nft",
] as const) {
  test(`blocks inconsistent on-chain graph: ${graphFault}`, async ({
    page,
  }) => {
    const state = await setupMock(page, { graphFault, mismatch: true });
    await page.goto("#trade");
    await expect(
      page.getByText("Trading paused", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review ask", exact: true }),
    ).toBeDisabled();
    expect(state.transactions).toHaveLength(0);
  });
}

for (const name of ["SqueekNFT", "SqueekToken", "SqueekMining", "SqueekCore"]) {
  test(`blocks when documented ${name} has no code`, async ({ page }) => {
    await setupMock(page, { noCodeAt: docs.contracts[name].address });
    await page.goto("#trade");
    await expect(
      page.getByText("Trading paused", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review ask", exact: true }),
    ).toBeDisabled();
  });
}

for (const [name, options] of [
  ["RPC outage", { rpcUnavailable: true }],
  ["wrong RPC chain", { rpcChain: 1 }],
  ["documentation mismatch", { docsMismatch: true }],
  ["documentation outage", { docsUnavailable: true }],
] as [string, Partial<MockState>][]) {
  test(`${name} fails closed`, async ({ page }) => {
    await setupMock(page, options);
    await page.goto("#trade");
    await expect(
      page.getByText("Trading paused", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Review ask", exact: true }),
    ).toBeDisabled();
  });
}

test("mismatched API cannot change wallet holdings, planner inputs, board or a merge target", async ({
  page,
}) => {
  const state = await setupMock(page, { mismatch: true });
  state.tokens.get(1n)!.nextMergeBlock = 2000;
  await page.goto("");
  await expect(
    page.getByText("Identity checks passed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mock Squeek Wallet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Holdings by level" }),
  ).toBeVisible();
  await expect(page.getByText("6,000", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1,000 blocks cooling", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Not merge-ready", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Chain planner", exact: true }).click();
  await expect(page.getByText("3 × Level 1", { exact: true })).toBeVisible();
  await expect(page.getByText("1 × Level 2", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Match board", exact: true }).click();
  await page
    .getByRole("button", { name: "Scan holder singles", exact: true })
    .click();
  await expect(page.getByText(/2 possible partners/)).toBeVisible();
  await expect(
    page.getByText("3 at this level · Unpaired #3", { exact: true }),
  ).toBeVisible();

  // Complete a merge using two different, ready Squeeks. All signing is mocked.
  await page.getByRole("link", { name: "Merge", exact: true }).click();
  await page
    .getByLabel("Survivor ID · keep this Squeek", { exact: true })
    .fill("2");
  await page
    .getByLabel("Donor ID · burn this Squeek", { exact: true })
    .fill("3");
  await page
    .getByRole("button", { name: "Preview merge", exact: true })
    .click();
  await expect(
    page.getByText("Level 2 · 3,000 power", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I confirm #2 survives and #3 is permanently burned.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Review permanent merge", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Burn #3 and merge", exact: true })
    .click();
  await expect(
    page.getByText("All steps confirmed on Sepolia.", { exact: true }),
  ).toBeVisible();
  expect(state.transactions.at(-1)?.to.toLowerCase()).toBe(
    docs.contracts.SqueekMining.address.toLowerCase(),
  );
  expect(state.transactions.at(-1)?.args).toEqual([0, 2n, 3n]);
  expect(
    state.apiCalls.some((path) => /\/accounts\/|\/squeeks\//.test(path)),
  ).toBe(false);
  expect(
    state.contractReads.some(
      (call) => call.name === "SqueekNFT" && call.functionName === "mining",
    ),
  ).toBe(true);
  const targets = new Set(
    [
      handoff.contracts[0].address,
      ...["SqueekNFT", "SqueekToken", "SqueekMining", "SqueekCore"].map(
        (name) => docs.contracts[name].address,
      ),
    ].map((a) => a.toLowerCase()),
  );
  expect(
    state.contractReads.every((call) => targets.has(call.to.toLowerCase())),
  ).toBe(true);
  expect(
    state.contractReads
      .filter((call) => call.functionName === "position")
      .every(
        (call) =>
          call.to.toLowerCase() ===
          docs.contracts.SqueekMining.address.toLowerCase(),
      ),
  ).toBe(true);
});

test("footer shows the documented set even when the RPC cannot load", async ({
  page,
}) => {
  await setupMock(page, { rpcUnavailable: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("");
  const footer = page.getByRole("contentinfo");
  for (const [name, address] of [
    ["SqueekMatchEscrow", handoff.contracts[0].address],
    ...["SqueekNFT", "SqueekToken", "SqueekMining", "SqueekCore"].map(
      (name) => [name, docs.contracts[name].address],
    ),
  ]) {
    await expect(
      footer.getByRole("link", { name: new RegExp(`^${name} `) }),
    ).toHaveAttribute("href", new RegExp(address, "i"));
  }
  await expect(footer).toContainText(
    "A newer Squeekchain testnet deployment exists and will get its own escrow later.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
});

test("required graph checks do not wait for a slow API", async ({ page }) => {
  await setupMock(page);
  let release: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("https://api.squeekchain.com/**", async (route) => {
    await pending;
    await route.fulfill({ status: 503, json: {} }).catch(() => {});
  });
  await page.goto("");
  await expect(
    page.getByText("Identity checks passed", { exact: true }),
  ).toBeVisible({ timeout: 5000 });
  await page
    .getByRole("textbox", { name: "Wallet address", exact: true })
    .fill(A);
  await page
    .getByRole("button", { name: "Find my singles", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Holdings by level" }),
  ).toBeVisible({ timeout: 5000 });
  release();
});

test("RPC loss after opening a review blocks the approval signature", async ({
  page,
}) => {
  const state = await setupMock(page);
  await page.goto("#trade");
  await expect(
    page.getByText("Identity checks passed", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mock Squeek Wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Bid for a level", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Bid amount · SQK", exact: true })
    .fill("9");
  await page.getByRole("button", { name: "Review bid", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Approve SQK", exact: true }),
  ).toBeVisible();
  state.rpcUnavailable = true;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Approve SQK", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Trading stays paused",
  );
  expect(state.transactions).toHaveLength(0);
});
