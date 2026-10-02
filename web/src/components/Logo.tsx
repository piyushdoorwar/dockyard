/** The Dockyard mark: stacked containers on a hull, on a green badge. */
export function Logo({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" className={className} aria-hidden>
      <rect width="64" height="64" rx="16" fill="var(--color-primary)" />
      <path d="M14 25h11v10H14V25Zm13 0h11v10H27V25Zm13 0h11v10H40V25Z" fill="#DDF2E5" />
      <path d="M20.5 13h11v10h-11V13Zm13 0h11v10h-11V13Z" fill="#fff" />
      <path d="M9.5 37h45l-2.2 5.7A14.1 14.1 0 0 1 39.1 52H25.4A16.1 16.1 0 0 1 9.5 38.4V37Z" fill="#fff" />
      <path d="M16 44c3.2 2.1 6.4 2.1 9.6 0s6.4-2.1 9.6 0 6.4 2.1 9.6 0" stroke="var(--color-primary)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function Wordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={30} />
      {!compact && <span className="text-[19px] font-bold tracking-tight text-ink">Dockyard</span>}
    </span>
  );
}
