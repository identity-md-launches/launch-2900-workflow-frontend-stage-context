import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
import { keccak256, toBytes } from "viem";
const web = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(web, "../dist");
const handoff = JSON.parse(
  await readFile(resolve(web, "deployment-handoff.json"), "utf8"),
);
const network = JSON.parse(
  await readFile(resolve(web, "network-handoff.json"), "utf8"),
);
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
const json = (v) => JSON.stringify(canonical(v));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safe = (path) =>
  typeof path === "string" &&
  !path.startsWith("/") &&
  !path.includes("..") &&
  !path.includes(":") &&
  !path.includes("\\");
const contracts = [];
for (const contract of handoff.contracts) {
  const abiPath = `abi/${contract.name}.json`;
  const abi = JSON.parse(await readFile(resolve(dist, abiPath), "utf8"));
  if (!Array.isArray(abi)) throw new Error("ABI must be a raw array");
  const hash = keccak256(toBytes(json(abi))).slice(2);
  if (hash !== contract.abiHash)
    throw new Error(`ABI hash mismatch: ${contract.name}: ${hash}`);
  contracts.push({
    name: contract.name,
    address: contract.address,
    abiHash: contract.abiHash,
    abiPath,
  });
}
async function inventory(dir) {
  const files = [];
  for (const name of (await readdir(dir)).sort()) {
    const path = resolve(dir, name);
    const info = await stat(path);
    if (info.isDirectory()) files.push(...(await inventory(path)));
    else if (name !== "imd-deployment.json") {
      const assetPath = relative(dist, path).replaceAll("\\", "/");
      if (!safe(assetPath) || info.size > 8388608)
        throw new Error(`Invalid asset ${assetPath}`);
      files.push({ path: assetPath, sha256: sha(await readFile(path)) });
    }
  }
  return files;
}
const assets = await inventory(dist);
if (assets.length > 128) throw new Error("Too many exported assets");
const manifest = {
  version: 1,
  launchId: handoff.launchId,
  chainId: handoff.chainId,
  sourceCommit: handoff.sourceCommit,
  attestationHash: handoff.attestationHash,
  contracts,
  assets,
  ...(handoff.poolKey ? { poolKey: handoff.poolKey } : {}),
  ...network,
};
if (process.argv.includes("--check")) {
  const actual = JSON.parse(
    await readFile(resolve(dist, "imd-deployment.json"), "utf8"),
  );
  if (json(actual) !== json(manifest))
    throw new Error("Manifest, handoff or asset inventory mismatch");
} else
  await writeFile(
    resolve(dist, "imd-deployment.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
console.log(
  `${process.argv.includes("--check") ? "Verified" : "Generated"} deployment manifest: ${contracts.length} contract, ${assets.length} assets. ABI canonical Keccak matches handoff.`,
);
