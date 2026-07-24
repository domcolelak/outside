import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

/**
 * Renders a legal document written in a deliberately small Markdown subset:
 * "## " / "### " headings, "- " bullets, "1. " numbered items, blank-line
 * paragraphs and **bold**. Keeping the source as text means the policies stay
 * editable without touching JSX, and avoids pulling in a Markdown dependency.
 */
function inline(text: string, keyPrefix: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith("**") && part.endsWith("**")
      ? <strong key={`${keyPrefix}-${index}`} className="font-medium text-ink">{part.slice(2, -2)}</strong>
      : <span key={`${keyPrefix}-${index}`}>{part}</span>,
  );
}

function render(body: string) {
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, index) => (
      <li key={index} className="leading-relaxed">{inline(item, `li-${blocks.length}-${index}`)}</li>
    ));
    blocks.push(
      list.ordered
        ? <ol key={blocks.length} className="ml-5 list-decimal space-y-1.5 text-ink-soft">{items}</ol>
        : <ul key={blocks.length} className="ml-5 list-disc space-y-1.5 text-ink-soft">{items}</ul>,
    );
    list = null;
  };

  for (const rawLine of body.trim().split("\n")) {
    const line = rawLine.trim();
    if (!line) { flush(); continue; }

    if (line.startsWith("### ")) {
      flush();
      blocks.push(<h3 key={blocks.length} className="mt-7 text-base font-medium text-ink">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push(<h2 key={blocks.length} className="mt-10 border-t border-line pt-8 text-xl font-semibold text-ink">{line.slice(3)}</h2>);
    } else if (/^[-*] /.test(line)) {
      if (!list || list.ordered) { flush(); list = { ordered: false, items: [] }; }
      list.items.push(line.slice(2));
    } else if (/^\d+\.\s/.test(line)) {
      if (!list || !list.ordered) { flush(); list = { ordered: true, items: [] }; }
      list.items.push(line.replace(/^\d+\.\s/, ""));
    } else {
      flush();
      blocks.push(<p key={blocks.length} className="mt-4 leading-relaxed text-ink-soft">{inline(line, `p-${blocks.length}`)}</p>);
    }
  }
  flush();
  return blocks;
}

export function LegalDocument({ title, updated, body }: { title: string; updated: string; body: string }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/"><Wordmark className="h-6" /></Link>
          <Link href="/" className="mono text-xs text-ink-soft hover:text-ink">Back to site</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{title}</h1>
        <p className="mono mt-2 text-xs text-ink-faint">Last updated: {updated}</p>
        <div className="mt-8 text-[15px]">{render(body)}</div>
      </main>
    </div>
  );
}
