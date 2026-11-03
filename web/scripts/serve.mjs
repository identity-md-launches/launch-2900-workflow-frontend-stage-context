// Bounded by Playwright's webServer lifecycle. Serves dist at /preview/ with no SPA rewrites.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../../dist");
const port = Number(process.argv[process.argv.indexOf("--port") + 1]) || 4174;
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/preview/")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const path = resolve(
      dist,
      decodeURIComponent(url.pathname.slice("/preview/".length)) ||
        "index.html",
    );
    if (!path.startsWith(dist + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(path);
    if (!info.isFile()) throw new Error("Not a file");
    const bytes = await readFile(path);
    res.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Static export: http://127.0.0.1:${port}/preview/`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => server.close(() => process.exit(0)));
