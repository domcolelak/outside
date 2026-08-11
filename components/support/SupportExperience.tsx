"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Locale } from "@/lib/i18n/locales";
import type { FaqEntry, FaqId, SupportCopy } from "@/lib/support/knowledge";

interface ChatMessage {
  id: number;
  role: "assistant" | "user";
  text: string;
  suggestions?: FaqId[];
}

export function SupportExperience({
  locale,
  entries,
  copy,
}: {
  locale: Locale;
  entries: FaqEntry[];
  copy: SupportCopy;
}) {
  return (
    <>
      <section
        id="faq"
        className="scroll-mt-24 border-t border-line/60 bg-base-900/40"
      >
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-20 lg:grid-cols-[.72fr_1.28fr]">
          <div>
            <div className="mono text-[12px] uppercase tracking-widest text-signal">
              {copy.faqKicker}
            </div>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              {copy.faqTitle}
            </h2>
            <p className="mt-5 max-w-md text-sm leading-7 text-ink-soft">
              {copy.faqIntro}
            </p>
            <div className="mt-7 rounded-xl border border-signal/15 bg-signal/[.035] p-4">
              <div className="mono text-[10px] uppercase tracking-wider text-signal">
                {copy.assistantTitle}
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                {copy.assistantDisclosure}
              </p>
            </div>
          </div>
          <div className="divide-y divide-line/60 overflow-hidden rounded-2xl border border-line bg-base-950/55">
            {entries.map((entry, index) => (
              <details key={entry.id} className="group" open={index === 0}>
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 text-left text-sm font-medium text-ink transition hover:bg-base-800/50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-signal [&::-webkit-details-marker]:hidden">
                  <span>{entry.question}</span>
                  <span
                    aria-hidden
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line text-lg text-ink-faint transition group-open:rotate-45 group-open:border-signal/30 group-open:text-signal"
                  >
                    +
                  </span>
                </summary>
                <div className="px-5 pb-5 pr-14 text-sm leading-7 text-ink-soft">
                  {entry.answer}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
      <SupportAssistant
        key={locale}
        locale={locale}
        entries={entries}
        copy={copy}
      />
    </>
  );
}

function SupportAssistant({
  locale,
  entries,
  copy,
}: {
  locale: Locale;
  entries: FaqEntry[];
  copy: SupportCopy;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, role: "assistant", text: copy.assistantGreeting },
  ]);
  const nextId = useRef(1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled]), a[href]",
        ),
      ];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open)
      logRef.current?.scrollTo({
        top: logRef.current.scrollHeight,
        behavior: "smooth",
      });
  }, [messages, open, sending]);

  useEffect(() => () => abortRef.current?.abort(), []);

  function close() {
    abortRef.current?.abort();
    setSending(false);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  async function ask(question: string) {
    const clean = question.trim();
    if (clean.length < 2 || sending) return;
    setMessages((current) => [
      ...current,
      { id: nextId.current++, role: "user", text: clean },
    ]);
    setInput("");
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: clean, locale }),
        signal: controller.signal,
      });
      const body = (await response.json()) as {
        answer?: string;
        suggestions?: FaqId[];
        code?: string;
      };
      const text =
        response.ok && body.answer
          ? body.answer
          : body.code === "rate_limited"
            ? copy.assistantRateLimited
            : copy.assistantError;
      setMessages((current) => [
        ...current,
        {
          id: nextId.current++,
          role: "assistant",
          text,
          suggestions: response.ok ? body.suggestions : undefined,
        },
      ]);
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setMessages((current) => [
          ...current,
          {
            id: nextId.current++,
            role: "assistant",
            text: copy.assistantError,
          },
        ]);
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-base-950/70 sm:bg-transparent"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) close();
          }}
        >
          <section
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-x-3 bottom-20 flex max-h-[min(720px,calc(100dvh-6rem))] flex-col overflow-hidden rounded-2xl border border-line bg-base-900 shadow-2xl sm:inset-x-auto sm:bottom-24 sm:right-5 sm:w-[390px]"
          >
            <header className="flex items-start justify-between gap-4 border-b border-line/70 bg-base-950/65 px-4 py-4">
              <div>
                <div id={titleId} className="font-medium text-ink">
                  {copy.assistantTitle}
                </div>
                <div className="mt-1 text-xs leading-5 text-ink-faint">
                  {copy.assistantSubtitle}
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={copy.assistantClose}
                className="grid min-h-11 min-w-11 place-items-center rounded-lg border border-line text-xl text-ink-soft hover:bg-base-700 hover:text-ink focus-visible:outline-2 focus-visible:outline-signal"
              >
                ×
              </button>
            </header>

            <div
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4"
            >
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={message.role === "user" ? "ml-9" : "mr-9"}
                >
                  <div className="mono mb-1 text-[10px] uppercase tracking-wider text-ink-faint">
                    {message.role === "user"
                      ? copy.assistantUserLabel
                      : copy.assistantMatchedLabel}
                  </div>
                  <div
                    className={
                      message.role === "user"
                        ? "rounded-xl rounded-tr-sm bg-signal px-3.5 py-3 text-sm leading-6 text-base-950"
                        : "rounded-xl rounded-tl-sm border border-line bg-base-950/65 px-3.5 py-3 text-sm leading-6 text-ink-soft"
                    }
                  >
                    {message.text}
                  </div>
                  {!!message.suggestions?.length && (
                    <div className="mt-3 space-y-2">
                      <div className="mono text-[10px] uppercase tracking-wider text-ink-faint">
                        {copy.assistantSuggestionsLabel}
                      </div>
                      {message.suggestions.map((id) => {
                        const entry = entries.find((item) => item.id === id);
                        return entry ? (
                          <button
                            key={id}
                            type="button"
                            onClick={() => void ask(entry.question)}
                            disabled={sending}
                            className="block w-full rounded-lg border border-line px-3 py-2 text-left text-xs leading-5 text-ink-soft transition hover:border-signal/30 hover:bg-signal/5 hover:text-ink disabled:opacity-50"
                          >
                            {entry.question}
                          </button>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              ))}
              {messages.length === 1 && (
                <div>
                  <div className="mono mb-2 text-[10px] uppercase tracking-wider text-ink-faint">
                    {copy.assistantQuickLabel}
                  </div>
                  <div className="space-y-2">
                    {entries.slice(0, 3).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => void ask(entry.question)}
                        disabled={sending}
                        className="block w-full rounded-lg border border-line px-3 py-2.5 text-left text-xs leading-5 text-ink-soft transition hover:border-signal/30 hover:bg-signal/5 hover:text-ink disabled:opacity-50"
                      >
                        {entry.question}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <form
              onSubmit={submit}
              className="border-t border-line/70 bg-base-950/65 p-3"
            >
              <label htmlFor={`${titleId}-question`} className="sr-only">
                {copy.assistantQuestionLabel}
              </label>
              <div className="flex gap-2">
                <input
                  id={`${titleId}-question`}
                  ref={inputRef}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  maxLength={500}
                  placeholder={copy.assistantPlaceholder}
                  disabled={sending}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-base-900 px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:border-signal/50 disabled:opacity-60"
                />
                <button
                  type="submit"
                  disabled={sending || input.trim().length < 2}
                  className="mono min-h-11 rounded-lg bg-signal px-4 text-xs font-semibold text-base-950 transition hover:bg-signal-bright disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sending ? copy.assistantSending : copy.assistantSend}
                </button>
              </div>
              <p className="mt-2 text-[10px] leading-4 text-ink-faint">
                {copy.assistantDisclosure}
              </p>
            </form>
          </section>
        </div>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={open ? copy.assistantClose : copy.assistantOpen}
        className="fixed bottom-5 right-5 z-50 inline-flex min-h-12 items-center gap-2 rounded-full border border-signal/30 bg-base-900 px-4 text-sm font-medium text-ink shadow-2xl transition hover:-translate-y-0.5 hover:border-signal/60 hover:bg-base-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
      >
        <span
          aria-hidden
          className="grid h-7 w-7 place-items-center rounded-full bg-signal text-base-950"
        >
          ?
        </span>
        <span>{open ? copy.assistantClose : copy.assistantOpen}</span>
      </button>
    </>
  );
}
