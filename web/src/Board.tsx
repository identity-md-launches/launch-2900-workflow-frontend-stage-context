import { useState } from "react";
import { Filter, Users } from "lucide-react";
import { indexEvents, reconstructHolders } from "./indexer";
import { errorText } from "./domain";
import { AddressLink, Empty, Field, IconSpin, Notice } from "./components";
import type { Context, Verification } from "./types";
export default function Board({
  ctx,
  verification,
  inspect,
}: {
  ctx: Context;
  verification: Verification;
  inspect: (address: string) => void;
}) {
  const [rows, setRows] = useState<ReturnType<typeof reconstructHolders>>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [level, setLevel] = useState("All");
  const [page, setPage] = useState(0);
  const [through, setThrough] = useState("");
  const eco = verification.ecosystem;
  async function scan() {
    if (!eco || pending) return;
    setPending(true);
    setError("");
    try {
      // Run both indexes to the same confirmed height; replaying a recent tail handles reorgs.
      const [nft, mining] = await Promise.all([
        indexEvents(
          ctx,
          eco.nft,
          ctx.abis.SqueekNFT,
          BigInt(ctx.docs.deploymentBlock),
          setProgress,
        ),
        indexEvents(
          ctx,
          eco.mining,
          ctx.abis.SqueekMining,
          BigInt(ctx.docs.deploymentBlock),
          setProgress,
        ),
      ]);
      const safe = nft.through < mining.through ? nft.through : mining.through;
      setRows(
        reconstructHolders(
          nft.events.filter((e) => BigInt(e.block) <= safe),
          mining.events.filter((e) => BigInt(e.block) <= safe),
        ),
      );
      setThrough(safe.toLocaleString());
      setPage(0);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
      setProgress("");
    }
  }
  const filtered =
    rows?.filter((r) => level === "All" || r.level === Number(level)) ?? [];
  return (
    <section className="surface stack">
      <div className="section-head">
        <h2>Find another single</h2>
        <Users size={22} aria-hidden="true" />
      </div>
      <p className="muted">
        Public NFT transfers and mining merge events reveal holders with an odd
        number at each level. An indexed single is a possible partner, not an
        offer to sell.
      </p>
      <div className="toolbar">
        <Field label="Level filter">
          <select
            value={level}
            onChange={(e) => {
              setLevel(e.target.value);
              setPage(0);
            }}
          >
            <option>All</option>
            {Array.from({ length: eco?.policy.maximumLevel ?? 10 }, (_, i) => (
              <option key={i + 1}>{i + 1}</option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          disabled={pending || !eco}
          onClick={() => void scan()}
        >
          {pending ? <IconSpin /> : <Filter size={17} />}Scan holder singles
        </button>
      </div>
      <p className="caption muted">
        The first scan can take a few minutes. Confirmed logs are cached in this
        browser’s IndexedDB; no server or private holder list is used.
        Contract-held NFTs can appear; inspect the wallet before assuming they
        can trade.
      </p>
      <div role="status">
        {pending && <p className="caption">{progress}</p>}
        {rows && (
          <p className="caption muted">
            {filtered.length} possible partners · Indexed through Sepolia block{" "}
            {through} · 12-confirmation delay
          </p>
        )}
      </div>
      {error && (
        <Notice tone="error">
          {error} Retry the scan to resume from its last completed block.
        </Notice>
      )}
      {rows === undefined ? (
        <Empty title="The board lives on chain">
          <p>
            Scan the public events to find holders at your level. Nothing is
            seeded or simulated.
          </p>
        </Empty>
      ) : !filtered.length ? (
        <Empty title="No singles in this view">
          <p>Choose another level or refresh the event scan.</p>
        </Empty>
      ) : (
        <>
          <div className="holder-list">
            {filtered.slice(page * 20, (page + 1) * 20).map((r) => (
              <article className="holder-row" key={`${r.owner}-${r.level}`}>
                <span className="level-icon">L{r.level}</span>
                <div>
                  <AddressLink address={r.owner} ctx={ctx} />
                  <p className="caption muted">
                    {r.count} at this level · Unpaired #{String(r.id)}
                  </p>
                </div>
                <button type="button" onClick={() => inspect(r.owner)}>
                  Inspect wallet
                </button>
              </article>
            ))}
          </div>
          <div className="toolbar">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((n) => n - 1)}
            >
              Previous
            </button>
            <span className="caption">
              Page {page + 1} of {Math.ceil(filtered.length / 20)}
            </span>
            <button
              type="button"
              disabled={(page + 1) * 20 >= filtered.length}
              onClick={() => setPage((n) => n + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
      <p className="caption muted">
        Level and ownership here are reconstructed at the indexed block. Live
        eligibility, cooldown, custody and rewards are checked in My singles and
        again before a trade. Market fair-value tags compare only current
        fillable orders at the same level.
      </p>
    </section>
  );
}
