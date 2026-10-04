"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { configResult } from "@/lib/config/env";
import { FINAL, NON_FINAL, contractAddress, readClient } from "@/lib/genlayer/client";
import type { Read } from "@/lib/genlayer/contract";

export type ReadState<T> = {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
};

const POLL_MS = 90_000;

/**
 * Read one thing from the contract.
 *
 * `final` chooses which state to ask for, and the choice is never incidental.
 * Anything presented as settled is read finalized. A page following something
 * the person just sent reads the newest state, because a write is accepted long
 * before it is final and the finalized view does not contain it yet.
 *
 * Polling pauses while the tab is hidden, but the first read always happens: a
 * page opened in a background tab still has to load.
 */
export function useRead<T>(
  read: Read<T> | undefined,
  options: { final?: boolean; pollMs?: number } = {},
): ReadState<T> {
  const { final = true, pollMs = 0 } = options;
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [settled, setSettled] = useState("");
  const [nonce, setNonce] = useState(0);
  const loadedOnce = useRef(false);

  const key = read ? `${read.functionName}:${JSON.stringify(read.args)}:${final}` : "";

  // Derived rather than stored. A key that has not finished loading IS the
  // loading state, and keeping a separate flag means setting state on the way
  // into an effect, which costs a render and drifts out of step with the key.
  const loading = Boolean(read) && configResult.ok && settled !== key;

  useEffect(() => {
    if (!read || !configResult.ok) return;
    let cancelled = false;

    const load = async () => {
      if (loadedOnce.current && typeof document !== "undefined" && document.hidden) return;
      try {
        const answer = await readClient().readContract({
          address: contractAddress(),
          functionName: read.functionName,
          args: read.args,
          transactionHashVariant: final ? FINAL : NON_FINAL,
        } as never);
        if (cancelled) return;
        const parsed = read.schema.safeParse(answer);
        if (!parsed.success) {
          // Name the field. "A shape this console does not recognise" tells
          // nobody which shape, and this is exactly when somebody needs to know.
          const first = parsed.error.issues[0];
          const where = first?.path?.join(".") || "the answer";
          setError(`The contract answered in a shape this console does not recognise `
                   + `(${where}: ${first?.message ?? "unexpected"}). It may be a different `
                   + `deployment than this console was built for.`);
        } else {
          setData(parsed.data);
          setError(undefined);
        }
      } catch (problem) {
        if (!cancelled) {
          setError(String((problem as { message?: string })?.message ?? problem).slice(0, 300));
        }
      } finally {
        if (!cancelled) {
          loadedOnce.current = true;
          setSettled(key);
        }
      }
    };

    void load();
    if (!pollMs) return () => { cancelled = true; };
    const timer = setInterval(load, pollMs);
    return () => { cancelled = true; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce, pollMs, final]);

  return { data, error, loading, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

export const LIST_POLL = POLL_MS;
