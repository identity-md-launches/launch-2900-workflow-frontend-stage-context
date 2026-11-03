import { test, expect, type Page } from "@playwright/test";
import { setupMock, A, SQK } from "./mock-chain";
async function ready(page: Page) {
  await page.goto("");
  await expect(
    page.getByText("Identity checks passed", { exact: true }),
  ).toBeVisible();
}
async function connect(page: Page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mock Squeek Wallet", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "0x83A8…9D31", exact: true }),
  ).toBeVisible();
}
async function trade(page: Page) {
  await page.getByRole("link", { name: "Trade", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Create an order", exact: true }),
  ).toBeVisible();
}
async function finishSteps(page: Page, names: string[]) {
  const dialog = page.getByRole("dialog");
  for (const name of names) {
    await dialog.getByRole("button", { name, exact: true }).click();
  }
  await expect(
    dialog.getByText("All steps confirmed on Sepolia.", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
}
test("read-only address lookup finds odd levels, pairs, cooldowns and current power", async ({
  page,
}) => {
  await setupMock(page);
  await ready(page);
  await page
    .getByRole("textbox", { name: "Wallet address", exact: true })
    .fill(A);
  await page
    .getByRole("button", { name: "Find my singles", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Holdings by level" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 pair + 1 single", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("6,000", { exact: true })).toBeVisible();
  await expect(page.getByText("#4", { exact: true })).toBeVisible();
  await expect(page.getByText("12.5 SQK unclaimed").first()).toBeVisible();
});
test("invalid address is recoverable and never opens a wallet", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await page
    .getByRole("textbox", { name: "Wallet address", exact: true })
    .fill("not an address");
  await page
    .getByRole("button", { name: "Find my singles", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Paste a complete Ethereum address",
  );
  expect(state.transactions).toHaveLength(0);
});
test("EIP-6963 wallet is named, Escape closes the sheet and restores focus", async ({
  page,
}) => {
  await setupMock(page);
  await ready(page);
  const trigger = page.getByRole("button", {
    name: "Connect wallet",
    exact: true,
  });
  await trigger.click();
  await expect(
    page.getByRole("button", { name: "Mock Squeek Wallet", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Injected", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
test("missing chain triggers add-chain with the exact handoff then switches again", async ({
  page,
}) => {
  await setupMock(page, { unknownChain: true, chain: 1 });
  await ready(page);
  await connect(page);
  const calls = await page.evaluate(
    () =>
      (
        window as unknown as {
          __walletCalls: { method: string; params?: unknown[] }[];
        }
      ).__walletCalls,
  );
  const methods = calls.map((c) => c.method);
  expect(
    methods.filter((m) => m === "wallet_switchEthereumChain"),
  ).toHaveLength(2);
  expect(methods).toContain("wallet_addEthereumChain");
  const add = calls.find((c) => c.method === "wallet_addEthereumChain")!;
  expect((add.params![0] as { chainId: string }).chainId).toBe("0xaa36a7");
  expect((add.params![0] as { rpcUrls: string[] }).rpcUrls).toContain(
    "https://ethereum-sepolia-rpc.publicnode.com",
  );
});
test("wallet rejection stays in the picker with a recovery message", async ({
  page,
}) => {
  await setupMock(page, { rejectWallet: true });
  await ready(page);
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mock Squeek Wallet", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Request declined");
  await expect(
    page.getByRole("button", { name: "Mock Squeek Wallet", exact: true }),
  ).toBeEnabled();
});
test("API identity mismatch blocks trade and merge signing", async ({
  page,
}) => {
  const state = await setupMock(page, { mismatch: true });
  await page.goto("");
  await expect(page.getByText("Trading paused", { exact: true })).toBeVisible();
  await connect(page);
  await trade(page);
  await expect(
    page.getByRole("button", { name: "Review ask", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByText(
        "Squeekchain identities disagree. Trading and merging are paused.",
      )
      .first(),
  ).toBeVisible();
  expect(state.transactions).toHaveLength(0);
});
test("no deployed code refuses trading before graph or API trust", async ({
  page,
}) => {
  await setupMock(page, { noCode: true });
  await page.goto("");
  await expect(page.getByText("Trading paused", { exact: true })).toBeVisible();
  await trade(page);
  await expect(
    page.getByRole("button", { name: "Review ask", exact: true }),
  ).toBeDisabled();
});
test("ask uses an exact NFT approval followed by simulated createAsk", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await connect(page);
  await trade(page);
  await page.getByRole("textbox", { name: "Your Squeek ID" }).fill("1");
  await page
    .getByRole("textbox", { name: "Asking price · SQK", exact: true })
    .fill("22.25");
  await page
    .getByRole("checkbox", { name: /I’ve checked unclaimed SQK/ })
    .check();
  await page.getByRole("button", { name: "Review ask", exact: true }).click();
  await finishSteps(page, ["Approve Squeek #1", "Create ask"]);
  expect(state.transactions.map((t) => t.functionName)).toEqual([
    "approve",
    "createAsk",
  ]);
  expect(state.transactions[0].args[1]).toBe(1n);
  expect(state.transactions[1].args[1]).toBe(SQK("22.25"));
  expect(state.transactions[1].args[2]).toBe(604800n);
  expect(state.rpcCalls.filter((c) => c === "eth_call").length).toBeGreaterThan(
    10,
  );
});
test("bid approval is an exact SQK amount and cannot duplicate while waiting for receipt", async ({
  page,
}) => {
  const state = await setupMock(page, { receiptDelay: 250 });
  await ready(page);
  await connect(page);
  await trade(page);
  await page
    .getByRole("button", { name: "Bid for a level", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Bid amount · SQK", exact: true })
    .fill("31.125");
  await page.getByRole("button", { name: "Review bid", exact: true }).click();
  const d = page.getByRole("dialog");
  await d.getByRole("button", { name: "Approve SQK", exact: true }).click();
  await expect(
    d.getByRole("button", { name: "Approve SQK…", exact: true }),
  ).toBeDisabled();
  await expect(
    d.getByRole("button", { name: "Create bid", exact: true }),
  ).toBeEnabled();
  await finishSteps(page, ["Create bid"]);
  expect(state.transactions.map((t) => t.functionName)).toEqual([
    "approve",
    "createBid",
  ]);
  expect(state.transactions[0].args[1]).toBe(SQK("31.125"));
  expect(state.transactions[1].args).toEqual([1, true, SQK("31.125"), 604800n]);
});
test("swap exposes a one-sided SQK difference and the exact wanted token", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await connect(page);
  await trade(page);
  await page.getByRole("button", { name: "Swap Squeeks", exact: true }).click();
  await page.getByRole("textbox", { name: "Your Squeek ID" }).fill("2");
  await page
    .getByRole("textbox", { name: "Requested Squeek ID (optional)" })
    .fill("5");
  await page
    .getByRole("textbox", { name: "SQK difference", exact: true })
    .fill("4");
  await page
    .getByRole("combobox", { name: "Who adds SQK?", exact: true })
    .selectOption("taker");
  await page
    .getByRole("checkbox", { name: /I’ve checked unclaimed SQK/ })
    .check();
  await page.getByRole("button", { name: "Review swap", exact: true }).click();
  await finishSteps(page, ["Approve Squeek #2", "Create swap"]);
  expect(state.transactions.map((t) => t.functionName)).toEqual([
    "approve",
    "createSwap",
  ]);
  expect(state.transactions[1].args).toEqual([
    2n,
    5n,
    1,
    true,
    0n,
    SQK("4"),
    604800n,
  ]);
});
test("buy ask requires a live cooldown preview and then offers buy-then-merge", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await connect(page);
  await trade(page);
  await page.getByRole("textbox", { name: "Order ID", exact: true }).fill("1");
  await page.getByRole("button", { name: "Look up", exact: true }).click();
  let d = page.getByRole("dialog");
  await expect(
    d.getByRole("button", { name: "Review trade", exact: true }),
  ).toBeDisabled();
  await d
    .getByRole("button", { name: "Check live Squeek details", exact: true })
    .click();
  await expect(d.getByText("Cooldown complete", { exact: true })).toBeVisible();
  await expect(d.getByText("No pending change", { exact: true })).toBeVisible();
  await d.getByRole("button", { name: "Review trade", exact: true }).click();
  await finishSteps(page, ["Approve SQK", "Buy Squeek"]);
  await expect(
    page.getByRole("heading", {
      name: "Two Squeeks. One stronger.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Survivor ID · keep this Squeek", { exact: true }),
  ).toHaveValue("5");
  expect(state.transactions.at(-1)?.functionName).toBe("fillAsk");
});
test("fill bid transfers an explicitly offered matching NFT", async ({
  page,
}) => {
  const state = await setupMock(page);
  state.orders.get(2n)!.maker = "0x598958abf7d8db8dd468cb53dd6ba705581bff54";
  await ready(page);
  await connect(page);
  await trade(page);
  await page.getByRole("textbox", { name: "Order ID", exact: true }).fill("2");
  await page.getByRole("button", { name: "Look up", exact: true }).click();
  const d = page.getByRole("dialog");
  await d
    .getByRole("textbox", { name: "Squeek ID you offer", exact: true })
    .fill("3");
  await d
    .getByRole("button", { name: "Check live Squeek details", exact: true })
    .click();
  await d.getByRole("checkbox", { name: /I’ve checked rewards/ }).check();
  await d.getByRole("button", { name: "Review trade", exact: true }).click();
  await finishSteps(page, ["Approve Squeek #3", "Sell into bid"]);
  expect(state.transactions.at(-1)?.args).toEqual([2n, 3n]);
  expect(state.transactions.at(-1)?.functionName).toBe("fillBid");
});
test("fill swap uses the offered NFT and checks both sides", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await connect(page);
  await trade(page);
  await page.getByRole("textbox", { name: "Order ID", exact: true }).fill("3");
  await page.getByRole("button", { name: "Look up", exact: true }).click();
  const d = page.getByRole("dialog");
  await d
    .getByRole("textbox", { name: "Squeek ID you offer", exact: true })
    .fill("2");
  await d
    .getByRole("button", { name: "Check live Squeek details", exact: true })
    .click();
  await expect(
    d.getByRole("heading", { name: "You receive", exact: true }),
  ).toBeVisible();
  await expect(
    d.getByRole("heading", { name: "You give", exact: true }),
  ).toBeVisible();
  await d.getByRole("checkbox", { name: /I’ve checked rewards/ }).check();
  await d.getByRole("button", { name: "Review trade", exact: true }).click();
  await finishSteps(page, ["Approve Squeek #2", "Swap Squeeks"]);
  expect(state.transactions.at(-1)?.functionName).toBe("fillSwap");
});
for (const [id, kind] of [
  [4, "ask"],
  [2, "bid"],
  [3, "swap"],
] as const)
  test(`cancel ${kind} remains available on mismatch and uses the exact escrow`, async ({
    page,
  }) => {
    const state = await setupMock(page, { mismatch: true });
    if (id === 3) state.orders.get(3n)!.expiresAt = 1n;
    await page.goto("");
    await expect(
      page.getByText("Trading paused", { exact: true }),
    ).toBeVisible();
    await connect(page);
    await trade(page);
    await page
      .getByRole("textbox", { name: "Order ID", exact: true })
      .fill(String(id));
    await page.getByRole("button", { name: "Look up", exact: true }).click();
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: kind === "ask" ? "Cancel ask" : `Cancel ${kind} and refund`,
        exact: true,
      })
      .click();
    await finishSteps(page, ["Cancel order"]);
    expect(state.transactions.at(-1)?.functionName).toBe(
      `cancel${kind[0].toUpperCase() + kind.slice(1)}`,
    );
    expect(state.orders.get(BigInt(id))?.status).toBe(3);
  });
test("simulation revert gives a plain error and never requests a signature", async ({
  page,
}) => {
  const state = await setupMock(page, { revert: true, allowance: SQK("1000") });
  await ready(page);
  await connect(page);
  await trade(page);
  await page
    .getByRole("button", { name: "Bid for a level", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Bid amount · SQK", exact: true })
    .fill("10");
  await page.getByRole("button", { name: "Review bid", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create bid", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "already been filled or cancelled",
  );
  expect(state.transactions).toHaveLength(0);
});
test("merge previews official power, requires permanent-burn confirmation and signs survivor first", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await connect(page);
  await page.getByRole("link", { name: "Merge", exact: true }).click();
  await page
    .getByLabel("Survivor ID · keep this Squeek", { exact: true })
    .fill("1");
  await page
    .getByLabel("Donor ID · burn this Squeek", { exact: true })
    .fill("2");
  await page
    .getByRole("button", { name: "Preview merge", exact: true })
    .click();
  await expect(
    page.getByText("Level 2 · 3,000 power", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review permanent merge", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "I confirm #1 survives and #2 is permanently burned.",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", { name: "Review permanent merge", exact: true })
    .click();
  await finishSteps(page, ["Burn #2 and merge"]);
  expect(state.transactions.at(-1)?.functionName).toBe("merge");
  expect(state.transactions.at(-1)?.args).toEqual([0, 1n, 2n]);
});
test("pending power and cooldown prevent a merge even with the burn acknowledgement", async ({
  page,
}) => {
  const state = await setupMock(page);
  state.tokens.get(1n)!.nextMergeBlock = 2000;
  state.tokens.get(2n)!.pendingRound = 101;
  await ready(page);
  await connect(page);
  await page.getByRole("link", { name: "Merge", exact: true }).click();
  await page
    .getByLabel("Survivor ID · keep this Squeek", { exact: true })
    .fill("1");
  await page
    .getByLabel("Donor ID · burn this Squeek", { exact: true })
    .fill("2");
  await page
    .getByRole("button", { name: "Preview merge", exact: true })
    .click();
  await expect(
    page.getByText(
      "Wait for both cooldowns and pending power changes to complete.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("checkbox", {
      name: "I confirm #1 survives and #2 is permanently burned.",
      exact: true,
    })
    .check();
  await expect(
    page.getByRole("button", { name: "Review permanent merge", exact: true }),
  ).toBeDisabled();
});
test("planner handles 3 L1 plus 1 L2 and turns one L1 purchase into a bid", async ({
  page,
}) => {
  const state = await setupMock(page, { allowance: SQK("1000") });
  await ready(page);
  await connect(page);
  await expect(
    page.getByRole("heading", { name: "Holdings by level" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Chain planner", exact: true }).click();
  await expect(
    page.getByText("Most merges · 1 purchase", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Turn path into bids", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "1 × Level 1 · SQK per Squeek", exact: true })
    .fill("19");
  await page
    .getByRole("button", { name: "Review path bids", exact: true })
    .click();
  await finishSteps(page, ["Bid for level 1"]);
  expect(state.transactions.at(-1)?.args).toEqual([1, true, SQK("19"), 0n]);
});
test("holder board reconstructs singles from real-shaped events and reuses IndexedDB logs", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await page.getByRole("link", { name: "Match board", exact: true }).click();
  await page
    .getByRole("button", { name: "Scan holder singles", exact: true })
    .click();
  await expect(page.getByText(/2 possible partners/)).toBeVisible();
  await expect(
    page.getByText("3 at this level · Unpaired #3", { exact: true }),
  ).toBeVisible();
  const before = state.logCalls;
  await page
    .getByRole("button", { name: "Scan holder singles", exact: true })
    .click();
  await expect(page.getByText(/2 possible partners/)).toBeVisible();
  expect(state.logCalls - before).toBeLessThanOrEqual(4);
});
test("RPC log failures show retry instructions instead of an invented empty balance", async ({
  page,
}) => {
  await setupMock(page, { failLogs: true });
  await ready(page);
  await page
    .getByRole("textbox", { name: "Wallet address", exact: true })
    .fill(A);
  await page
    .getByRole("button", { name: "Find my singles", exact: true })
    .click();
  await expect(page.locator("#scan-error")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "No Squeeks found in this wallet",
      exact: true,
    }),
  ).toHaveCount(0);
});
for (const width of [320, 390, 820, 1440])
  test(`all primary pages reflow at ${width}px`, async ({ page }) => {
    await setupMock(page);
    await page.setViewportSize({ width, height: 844 });
    await ready(page);
    for (const id of ["singles", "planner", "board", "trade", "merge"]) {
      await page.goto(`#${id}`);
      await expect(page.locator("h1")).toBeVisible();
      const overflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(overflow, `${id} horizontal overflow`).toBe(false);
    }
    if (width === 390) {
      await page.goto("#singles");
      const button = page.getByRole("button", {
        name: "Find my singles",
        exact: true,
      });
      const rect = await button.boundingBox();
      expect(rect!.y + rect!.height).toBeLessThan(844);
    }
  });
test("phone without an extension offers all four app browsers plus Coinbase Smart Wallet", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile Safari/604.1",
  });
  const page = await context.newPage();
  await setupMock(page, { wallet: false });
  await page.addInitScript(() =>
    Object.defineProperty(window, "ethereum", {
      value: undefined,
      configurable: true,
    }),
  );
  await ready(page);
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  for (const name of ["MetaMask", "Coinbase Wallet", "Rabby", "Phantom"])
    await expect(
      page.getByRole("link", { name: `Open in ${name}`, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Coinbase Smart Wallet", exact: true }),
  ).toBeVisible();
  const rabbyHref = await page
    .getByRole("link", { name: "Open in Rabby", exact: true })
    .getAttribute("href");
  const rabby = new URL(rabbyHref!);
  expect(rabby.pathname).toBe("/mobile/");
  expect(rabby.searchParams.get("_cmd")).toBe("open-dapp");
  expect(rabby.searchParams.get("dapp")).toBe(page.url());
  await context.close();
});

test("wrong network stays visible and one switch restores transaction eligibility", async ({
  page,
}) => {
  await setupMock(page);
  await ready(page);
  await connect(page);
  await page.evaluate(async () => {
    const provider = (
      window as unknown as {
        ethereum: {
          request: (p: {
            method: string;
            params: unknown[];
          }) => Promise<unknown>;
        };
      }
    ).ethereum;
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x1" }],
    });
  });
  await expect(
    page.getByRole("button", { name: "Switch to Sepolia", exact: true }),
  ).toBeVisible();
  await trade(page);
  await expect(
    page.getByRole("button", { name: "Review ask", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Switch to Sepolia", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Review ask", exact: true }),
  ).toBeEnabled();
});

test("a new mismatch after review blocks even the first approval signature", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await connect(page);
  await trade(page);
  await page
    .getByRole("button", { name: "Bid for a level", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Bid amount · SQK", exact: true })
    .fill("12");
  await page.getByRole("button", { name: "Review bid", exact: true }).click();
  state.mismatch = true;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Approve SQK", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "identities disagree",
  );
  expect(state.transactions).toHaveLength(0);
});

test("claim rewards is simulated and confirmed separately from the permanent merge", async ({
  page,
}) => {
  const state = await setupMock(page);
  await ready(page);
  await connect(page);
  await page.getByRole("link", { name: "Merge", exact: true }).click();
  await page
    .getByLabel("Survivor ID · keep this Squeek", { exact: true })
    .fill("2");
  await page
    .getByLabel("Donor ID · burn this Squeek", { exact: true })
    .fill("1");
  await page
    .getByRole("button", { name: "Preview merge", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Claim SQK before merging", exact: true })
    .click();
  await finishSteps(page, ["Claim SQK"]);
  expect(state.transactions.map((t) => t.functionName)).toEqual(["claim"]);
  expect(state.transactions[0].args).toEqual([0, [1n, 2n]]);
});

test("required API outage fails closed while read-only planning remains reachable", async ({
  page,
}) => {
  await setupMock(page, { apiUnavailable: true });
  await page.goto("");
  await expect(page.getByText("Trading paused", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Unable to verify all identity sources. Trading stays paused; retry the check.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Chain planner", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "Use a what-if inventory",
      exact: true,
    }),
  ).toBeEnabled();
});

test("runtime ABI tampering is rejected before wallet or transaction controls load", async ({
  page,
}) => {
  await setupMock(page);
  await page.route("**/abi/SqueekMatchEscrow.json", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("");
  await expect(page.getByRole("alert")).toContainText(
    "ABI integrity check failed",
  );
  await expect(
    page.getByRole("button", { name: "Connect wallet", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Retry loading deployment", exact: true }),
  ).toBeEnabled();
});

test("largest SQK values and full identity addresses wrap at 320 and 390", async ({
  page,
}) => {
  const state = await setupMock(page);
  state.orders.get(1n)!.amount = 2n ** 255n;
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await connect(page);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.getByText("View contract checks", { exact: true }).click();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
    await page.getByText("View contract checks", { exact: true }).click();
    await trade(page);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      ),
    ).toBe(false);
  }
});
