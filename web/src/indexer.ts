import { decodeEventLog, type Abi, type Address } from "viem";
import type { Context, IndexResult, IndexedEvent } from "./types";
export type ScanProgress = (message: string) => void;
type Cache = { events: IndexedEvent[]; through: string; from: string };
let dbPromise: Promise<IDBDatabase> | undefined;
const memory = new Map<string, Cache>();
function database() {
  return (dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open("squeekmatch-events-v1", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("logs");
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  }));
}
async function cached(key: string): Promise<Cache | undefined> {
  try {
    const db = await database();
    return await new Promise((resolve, reject) => {
      const r = db.transaction("logs").objectStore("logs").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return memory.get(key);
  }
}
async function persist(key: string, value: Cache) {
  memory.set(key, value);
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("logs", "readwrite");
      tx.objectStore("logs").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* Private browsing: keep an in-memory cache for this visit. */
  }
}
export async function clearIndexCache() {
  memory.clear();
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("logs", "readwrite");
      tx.objectStore("logs").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* already unavailable */
  }
}
/** Confirmed log index. Never advances the cursor past a failed range. Replays 24 blocks for reorgs. */
export async function indexEvents(
  ctx: Context,
  address: Address,
  abi: Abi,
  first: bigint,
  progress: ScanProgress,
  signal?: AbortSignal,
): Promise<IndexResult> {
  const key = `${ctx.deployment.chainId}:${ctx.deployment.sourceCommit}:${address.toLowerCase()}:${first}`;
  const previous = await cached(key);
  const head = await ctx.client.getBlockNumber({ cacheTime: 0 });
  const through = head > 12n ? head - 12n : head;
  const replay = previous ? BigInt(previous.through) - 24n : first;
  const from = replay > first && replay <= through ? replay : first;
  let events = previous
    ? previous.events.filter((e) => BigInt(e.block) < from)
    : [];
  let cursor = from;
  let chunk = 4000n;
  while (cursor <= through) {
    signal?.throwIfAborted();
    const end = cursor + chunk - 1n < through ? cursor + chunk - 1n : through;
    progress(
      `Reading blocks ${cursor.toLocaleString()}–${end.toLocaleString()} of ${through.toLocaleString()}`,
    );
    try {
      const logs = await ctx.client.getLogs({
        address,
        fromBlock: cursor,
        toBlock: end,
      });
      for (const log of logs) {
        try {
          const decoded = decodeEventLog({
            abi,
            data: log.data,
            topics: log.topics,
            strict: false,
          });
          const args = Object.fromEntries(
            Object.entries(decoded.args ?? {}).map(([k, v]) => [
              k,
              typeof v === "bigint" ? v.toString() : v,
            ]),
          );
          events.push({
            name: decoded.eventName ?? "Unknown",
            args: args as IndexedEvent["args"],
            block: String(log.blockNumber),
            logIndex: log.logIndex ?? 0,
            tx: log.transactionHash ?? "",
          });
        } catch {
          /* The supplied ABI may intentionally omit unrelated events. */
        }
      }
      signal?.throwIfAborted();
      await persist(key, {
        events,
        through: end.toString(),
        from: first.toString(),
      });
      cursor = end + 1n;
      chunk = chunk < 4000n ? chunk * 2n : chunk;
    } catch (error) {
      if (signal?.aborted) throw error;
      if (chunk <= 128n) throw error;
      chunk /= 2n;
    }
  }
  const unique = new Map(events.map((e) => [`${e.tx}:${e.logIndex}`, e]));
  events = [...unique.values()].sort(
    (a, b) =>
      Number(BigInt(a.block) - BigInt(b.block)) || a.logIndex - b.logIndex,
  );
  return { events, through, from: first, cached: !!previous };
}
export function reconstructHolders(
  transfers: IndexedEvent[],
  mining: IndexedEvent[],
) {
  const positions = new Map<string, { owner: Address; level: number }>();
  for (const event of transfers)
    if (event.name === "Transfer") {
      const id = String(event.args.tokenId);
      const to = String(event.args.to) as Address;
      if (/^0x0{40}$/i.test(to)) positions.delete(id);
      else
        positions.set(id, { owner: to, level: positions.get(id)?.level ?? 1 });
    }
  for (const event of mining)
    if (
      event.name === "PositionsMerged" &&
      Number(event.args.collection) === 0
    ) {
      const id = String(event.args.survivor);
      const position = positions.get(id);
      if (position) position.level = Number(event.args.level);
    }
  const byHolder = new Map<
    string,
    { owner: Address; levels: Map<number, bigint[]> }
  >();
  for (const [id, position] of positions) {
    const key = position.owner.toLowerCase();
    let holder = byHolder.get(key);
    if (!holder) {
      holder = { owner: position.owner, levels: new Map() };
      byHolder.set(key, holder);
    }
    const group = holder.levels.get(position.level) ?? [];
    group.push(BigInt(id));
    holder.levels.set(position.level, group);
  }
  return [...byHolder.values()].flatMap((holder) =>
    [...holder.levels]
      .filter(([, ids]) => ids.length % 2 === 1)
      .map(([level, ids]) => ({
        owner: holder.owner,
        level,
        id: ids.sort((a, b) => (a < b ? -1 : 1)).at(-1)!,
        count: ids.length,
      })),
  );
}
