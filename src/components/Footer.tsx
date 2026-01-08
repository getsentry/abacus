'use client';

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/5 px-4 sm:px-8 py-4">
      <div className="flex items-center justify-center">
        <a
          href="https://github.com/getsentry/abacus"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[10px] text-white/40 hover:text-white/60 transition-colors"
        >
          github.com/getsentry/abacus
        </a>
      </div>
    </footer>
  );
}
