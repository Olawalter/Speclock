export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="panel p-8 text-center">
      <p className="text-sm font-[540]">{title}</p>
      <p className="lede mx-auto mt-1 max-w-md text-sm">{detail}</p>
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="panel p-8 text-center" aria-live="polite">
      <p className="text-sm text-[var(--slate)]">Reading {what} from the contract…</p>
    </div>
  );
}

export function Problem({ message }: { message: string }) {
  return (
    <div role="alert" className="panel border-[var(--breaking-ink)]/30 p-5">
      <p className="text-sm font-[540]">That did not come back as expected</p>
      <p className="mt-1 text-sm text-[var(--slate)]">{message}</p>
    </div>
  );
}
