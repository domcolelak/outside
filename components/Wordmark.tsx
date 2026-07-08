export function Wordmark({ className = "h-6" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} style={{ height: undefined }}>
      <svg viewBox="0 0 24 24" className="h-[1.1em] w-[1.1em]" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="3" fill="#38e1c3" />
        <circle cx="12" cy="12" r="9" stroke="rgba(56,225,195,0.4)" strokeWidth="1.2" />
        <circle cx="12" cy="12" r="6" stroke="rgba(56,225,195,0.2)" strokeWidth="1" />
        <circle cx="21" cy="12" r="1.4" fill="#5b8cff" />
        <circle cx="6" cy="6.5" r="1.2" fill="#ff8a5b" />
        <circle cx="7" cy="18" r="1.1" fill="#f5c451" />
      </svg>
      <span className="text-[1.05em] font-semibold tracking-[0.2em] text-ink">OUTSIDE</span>
    </span>
  );
}
