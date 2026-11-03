import { useMemo, useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "@fontsource-variable/dm-sans";
import "./styles.css";
import { loadContext, makeWagmi } from "./config";
import { errorText } from "./domain";
import App from "./App";
import type { Context } from "./types";
function Ready({ ctx }: { ctx: Context }) {
  const config = useMemo(() => makeWagmi(ctx.deployment), [ctx]);
  const query = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
      }),
    [],
  );
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={query}>
        <App ctx={ctx} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}
function Bootstrap() {
  const [ctx, setCtx] = useState<Context>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    loadContext()
      .then((value) => {
        if (active) setCtx(value);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  if (ctx) return <Ready ctx={ctx} />;
  return (
    <main className="bootstrap">
      <img src="./favicon.svg" width="48" height="48" alt="" />
      <h1>SqueekMatch</h1>
      {error ? (
        <>
          <p role="alert">{error}</p>
          <button
            className="primary"
            type="button"
            onClick={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          >
            Retry loading deployment
          </button>
        </>
      ) : (
        <p role="status">Loading the attested deployment…</p>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Bootstrap />);
