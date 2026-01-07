export function ExcaliburLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Sword blade - sleek and minimal */}
      <path
        d="M24 4L26 8L26 32L24 34L22 32L22 8L24 4Z"
        fill="url(#blade-gradient)"
      />
      {/* Blade edge highlight */}
      <path
        d="M24 4L25 8L25 32L24 34L24 8L24 4Z"
        fill="rgba(255,255,255,0.3)"
      />
      {/* Crossguard */}
      <path
        d="M16 30L32 30L30 34L18 34L16 30Z"
        fill="url(#guard-gradient)"
      />
      {/* Grip */}
      <rect x="22" y="34" width="4" height="8" rx="1" fill="#1a1a2e" />
      <rect x="22.5" y="35" width="3" height="6" rx="0.5" fill="url(#grip-gradient)" />
      {/* Pommel */}
      <circle cx="24" cy="44" r="2.5" fill="url(#pommel-gradient)" />
      <circle cx="24" cy="44" r="1.5" fill="rgba(255,255,255,0.2)" />

      <defs>
        <linearGradient id="blade-gradient" x1="24" y1="4" x2="24" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67e8f9" />
          <stop offset="0.5" stopColor="#06b6d4" />
          <stop offset="1" stopColor="#0891b2" />
        </linearGradient>
        <linearGradient id="guard-gradient" x1="16" y1="30" x2="32" y2="34" gradientUnits="userSpaceOnUse">
          <stop stopColor="#a78bfa" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
        <linearGradient id="grip-gradient" x1="22" y1="34" x2="26" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4c1d95" />
          <stop offset="1" stopColor="#2e1065" />
        </linearGradient>
        <linearGradient id="pommel-gradient" x1="21.5" y1="41.5" x2="26.5" y2="46.5" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fcd34d" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
    </svg>
  );
}
