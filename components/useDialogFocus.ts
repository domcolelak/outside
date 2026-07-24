"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Moves focus into a modal, keeps keyboard navigation inside it, and restores
 * focus to the control that opened it. The dialog element must have tabIndex -1
 * so it remains a safe fallback when it contains no interactive controls.
 */
export function useDialogFocus(active = true) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const visibleControls = (dialog: HTMLElement) => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
      .filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true" && element.getClientRects().length > 0);
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const first = dialog ? visibleControls(dialog)[0] : null;
      (first ?? dialog)?.focus();
    });

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = visibleControls(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", trapFocus);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", trapFocus);
      if (previous?.isConnected) previous.focus();
    };
  }, [active]);

  return dialogRef;
}
