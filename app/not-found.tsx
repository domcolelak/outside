import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <div className="grid-backdrop pointer-events-none absolute inset-0" />
      <div className="relative">
        <Link href="/"><Wordmark className="mx-auto mb-8 h-6" /></Link>
        <div className="mono text-[12px] uppercase tracking-widest text-signal">404 · not found</div>
        <h1 className="mt-3 text-3xl font-semibold text-ink">This asset is outside our view.</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-ink-soft">
          The page you were looking for doesn&apos;t exist. Head back and map an external surface instead.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/" className="rounded-lg bg-signal px-4 py-2.5 text-sm font-semibold text-base-950 hover:bg-signal-bright">
            Back to start
          </Link>
          <Link href="/scan?target=northstar&mode=demo" className="mono rounded-lg border border-line px-4 py-2.5 text-xs text-ink-soft hover:bg-base-700">
            Watch demo
          </Link>
        </div>
      </div>
    </div>
  );
}
