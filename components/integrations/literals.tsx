import { Fragment, type ReactNode } from "react";

/**
 * Renders a translated sentence that names literal strings from another
 * product's interface.
 *
 * The Cloudflare help text points at "My Profile → API Tokens", "Zone:Read" and
 * "DNS:Edit". Those are labels a customer has to find in Cloudflare's own UI, so
 * they must not be translated — but the sentence around them must be, and every
 * language wants them in a different position.
 *
 * Splitting the sentence into fragments around each literal would fix the word
 * order in English. Passing the literals as interpolated values would lose the
 * emphasis that helps someone spot them. So the catalog holds one sentence with
 * {placeholders}, and this puts the literal back with its own styling wherever
 * the translation placed it.
 */
export function renderWithLiterals(
  template: string,
  literals: Record<string, string>,
): ReactNode {
  const names = Object.keys(literals);
  if (names.length === 0) return template;

  const pattern = new RegExp(`(\\{(?:${names.join("|")})\\})`, "g");
  return template.split(pattern).map((part, index) => {
    const name = part.startsWith("{") && part.endsWith("}") ? part.slice(1, -1) : null;
    const literal = name ? literals[name] : undefined;
    return literal ? (
      <span key={index} className="text-ink-soft">
        {literal}
      </span>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    );
  });
}
