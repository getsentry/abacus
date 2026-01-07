'use client';

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/5 px-4 sm:px-8 py-4">
      <div className="flex items-center justify-center gap-6">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-amber-500" />
          <span className="font-mono text-[10px] text-white/50">Claude Code</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-cyan-500" />
          <span className="font-mono text-[10px] text-white/50">Cursor</span>
        </div>
      </div>
    </footer>
  );
}
