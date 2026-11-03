import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const font = await readFile(
  resolve(
    web,
    "node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  ),
);
const art = await readFile(resolve(web, "public/partners.svg"), "utf8");
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<html><head><style>@font-face{font-family:DM;src:url(data:font/woff2;base64,${font.toString("base64")})}*{box-sizing:border-box}body{margin:0;background:#f7f7f0;color:#203c31;font-family:DM,system-ui;padding:64px}header{display:flex;align-items:center;font-size:32px;gap:16px}header span{font-weight:500}.mark{width:44px;height:44px;background:#234738;border-radius:12px;color:#e5edb0;display:grid;place-items:center}.main{display:flex;align-items:center;margin-top:68px;gap:24px}h1{font-size:68px;line-height:1.08;letter-spacing:-3px;margin:0 0 24px;font-weight:700}p{font-size:23px;color:#607065;margin:0;line-height:1.5}.art{width:410px;flex-shrink:0}.art svg{width:100%;height:auto}footer{position:absolute;bottom:56px;left:64px;right:64px;padding-top:20px;border-top:1px solid #dedfd2;display:flex;justify-content:space-between;font-size:18px;color:#607065}</style></head><body><header><div class="mark">↗</div><span>SqueekMatch</span></header><div class="main"><div><h1>Find your<br>merge partner.</h1><p>Plan a chain. Trade peer to peer.<br>Make more of your Squeeks.</p></div><div class="art">${art}</div></div><footer><span>Fan-made Squeekchain companion</span><span>Sepolia testnet · 0% market fee</span></footer></body></html>`,
  );
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: resolve(web, "public/social.png") });
  console.log("Generated 1200 × 630 social card.");
} finally {
  await browser.close();
}
