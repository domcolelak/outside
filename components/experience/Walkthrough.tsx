"use client";

import { useEffect, useState } from "react";
import { useDialogFocus } from "@/components/useDialogFocus";

export interface WalkthroughStep { eyebrow: string; title: string; body: string; selector?: string; action?: () => void }

export function Walkthrough({ steps, open, onClose }: { steps: WalkthroughStep[]; open: boolean; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useDialogFocus(open);
  useEffect(() => {
    if (!open) return;
    const step = steps[index]; step?.action?.();
    let element: HTMLElement | null = null;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", close);
    const timer = window.setTimeout(() => { element = step?.selector ? document.querySelector<HTMLElement>(step.selector) : null; element?.setAttribute("data-walkthrough-active", "true"); element?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 30);
    return () => { window.clearTimeout(timer); document.removeEventListener("keydown", close); element?.removeAttribute("data-walkthrough-active"); };
  }, [index, onClose, open, steps]);
  if (!open || !steps.length) return null;
  const step = steps[index]!;
  const next = () => { if (index === steps.length - 1) { setIndex(0); onClose(); } else setIndex((value) => value + 1); };
  return <div ref={dialogRef} tabIndex={-1} className="fixed inset-x-0 bottom-6 z-70 mx-auto w-[min(92vw,620px)] animate-rise-in" role="dialog" aria-modal="true" aria-label="Product walkthrough"><div className="rounded-2xl border border-signal/20 bg-base-950/95 p-4 shadow-[0_30px_100px_rgba(0,0,0,.7)] backdrop-blur-2xl"><div className="flex items-start gap-4"><div className="mono grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-signal/20 bg-signal/10 text-[11px] text-signal">{String(index + 1).padStart(2, "0")}</div><div className="min-w-0 flex-1" aria-live="polite"><div className="mono text-[11px] uppercase tracking-[.18em] text-signal">{step.eyebrow}</div><div className="mt-1 text-base font-medium text-ink">{step.title}</div><p className="mt-1 text-xs leading-5 text-ink-soft">{step.body}</p></div><button onClick={onClose} aria-label="Close walkthrough" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-faint hover:bg-base-700 hover:text-ink">×</button></div><div className="mt-4 flex items-center justify-between"><div className="flex gap-1">{steps.map((_, item) => <button key={item} onClick={() => setIndex(item)} aria-label={`Step ${item + 1}`} aria-current={item === index ? "step" : undefined} className="flex min-h-7 items-center"><span className={`block h-1 rounded-full transition-all ${item === index ? "w-8 bg-signal" : "w-3 bg-base-600"}`}/></button>)}</div><div className="flex gap-2">{index > 0 && <button onClick={() => setIndex((value) => value - 1)} className="rounded-lg border border-line px-3 py-1.5 text-[11px] text-ink-soft">Back</button>}<button onClick={next} className="rounded-lg bg-signal px-3 py-1.5 text-[11px] font-semibold text-base-950">{index === steps.length - 1 ? "Finish" : "Next"}</button></div></div></div></div>;
}
