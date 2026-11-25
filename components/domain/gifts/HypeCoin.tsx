/** Hype's coin: a gold coin with a star, beside Hype amounts (balance, packs, causes). Decoration: the number says it. */
export function HypeCoin({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="10" fill="#F5B83D" />
      <circle cx="12" cy="12" r="6.8" fill="none" stroke="#B9831F" strokeWidth="1.5" />
      <path d="M12 8.6l1.05 2.13 2.35.34-1.7 1.66.4 2.34L12 14l-2.1 1.07.4-2.34-1.7-1.66 2.35-.34z" fill="#B9831F" />
    </svg>
  );
}
