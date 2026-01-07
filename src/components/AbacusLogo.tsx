export function AbacusLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Frame */}
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none" />

      {/* Rod 1 - two beads left */}
      <line x1="3" y1="8" x2="21" y2="8" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <circle cx="7" cy="8" r="1.5" fill="currentColor" />
      <circle cx="11" cy="8" r="1.5" fill="currentColor" />

      {/* Rod 2 - three beads scattered */}
      <line x1="3" y1="12" x2="21" y2="12" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <circle cx="8" cy="12" r="1.5" fill="currentColor" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
      <circle cx="16" cy="12" r="1.5" fill="currentColor" />

      {/* Rod 3 - one bead right */}
      <line x1="3" y1="16" x2="21" y2="16" stroke="currentColor" strokeWidth="1" opacity="0.3" />
      <circle cx="17" cy="16" r="1.5" fill="currentColor" />
    </svg>
  );
}
