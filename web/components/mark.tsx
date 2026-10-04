/**
 * The SPECLOCK mark: three rules stacked, the top one closed by a bar.
 *
 * Requirements written down, and the line drawn under them when they are
 * frozen. Signal green on graphite, the two colours the product spends.
 */
export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} role="img" aria-label="SPECLOCK"
         xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#171a19" />
      <g stroke="#f7f8f5" strokeWidth="1.7" strokeLinecap="round">
        <path d="M6 9.5h8" />
        <path d="M6 13h11" />
      </g>
      <path d="M6 17h12" stroke="#b8f36b" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
