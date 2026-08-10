// Translation review workflow.
//
//   node scripts/translations.mjs report
//   node scripts/translations.mjs export sk [--out work.json]
//   node scripts/translations.mjs import work.json
//   node scripts/translations.mjs check          (CI: stale entries are reported, never overwritten)
//
// Catalogs stay pure JSON so a translator can read them. Review state lives
// beside them in messages/<locale>/.review.json, keyed the same way, holding the
// hash of the English source each translation was reviewed against.
//
// The rule that matters: when English changes, a human-reviewed translation is
// NOT overwritten and NOT silently kept as if it were still correct. It is
// marked stale and shows up in the report until someone reviews it. Anything
// else quietly ships text that no longer matches the product.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Overridable so the workflow itself can be tested against a throwaway catalog
// rather than the real one.
const ROOT = process.env.OUTSIDE_MESSAGES_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const SOURCE = "en";
const REVIEW_FILE = ".review.json";

const sourceHash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const locales = () => readdirSync(ROOT, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
/** Product and brand names, which read identically in every language. */
const NONTRANSLATABLE = new Set(readJson(join(ROOT, "nontranslatable.json"), { keys: [] }).keys);
const namespaces = () => readdirSync(join(ROOT, SOURCE)).filter((file) => file.endsWith(".json"));

/**
 * Every key in a locale, tagged with what a reviewer needs to know:
 *   missing    — no translation at all
 *   untranslated — identical to English (a placeholder, not a translation)
 *   stale      — reviewed once, but the English source has changed since
 *   unreviewed — translated but never signed off by a human
 *   reviewed   — signed off against the current English source
 */
function inspect(locale) {
  const review = readJson(join(ROOT, locale, REVIEW_FILE), {});
  const entries = [];

  for (const file of namespaces()) {
    const source = readJson(join(ROOT, SOURCE, file), {});
    const target = readJson(join(ROOT, locale, file), {});
    const ns = file.replace(/\.json$/, "");

    for (const [key, sourceValue] of Object.entries(source)) {
      const id = `${ns}.${key}`;
      const targetValue = target[key];
      const hash = sourceHash(sourceValue);
      const recorded = review[id];

      let status;
      if (targetValue === undefined) status = "missing";
      else if (NONTRANSLATABLE.has(id)) status = "identical";
      else if (locale !== SOURCE && JSON.stringify(targetValue) === JSON.stringify(sourceValue)) status = "untranslated";
      else if (!recorded) status = "unreviewed";
      else if (recorded.sourceHash !== hash) status = "stale";
      else status = "reviewed";

      entries.push({ id, namespace: ns, key, status, source: sourceValue, target: targetValue ?? null, sourceHash: hash, reviewedAt: recorded?.reviewedAt ?? null });
    }
  }
  return entries;
}

function report() {
  const rows = [];
  for (const locale of locales().filter((entry) => entry !== SOURCE)) {
    const entries = inspect(locale);
    const count = (status) => entries.filter((entry) => entry.status === status).length;
    rows.push({ locale, total: entries.length, reviewed: count("reviewed"), unreviewed: count("unreviewed"), stale: count("stale"), untranslated: count("untranslated"), missing: count("missing"), identical: count("identical") });
  }

  console.log("locale  total  reviewed  unreviewed  stale  untranslated  missing  brand");
  for (const row of rows) {
    console.log(`${row.locale.padEnd(6)}  ${String(row.total).padStart(5)}  ${String(row.reviewed).padStart(8)}  ${String(row.unreviewed).padStart(10)}  ${String(row.stale).padStart(5)}  ${String(row.untranslated).padStart(12)}  ${String(row.missing).padStart(7)}  ${String(row.identical).padStart(5)}`);
  }

  for (const locale of locales().filter((entry) => entry !== SOURCE)) {
    const needsWork = inspect(locale).filter((entry) => entry.status === "stale" || entry.status === "missing" || entry.status === "untranslated");
    if (needsWork.length) {
      console.log(`\n${locale} needs review:`);
      for (const entry of needsWork) console.log(`  ${entry.status.padEnd(12)} ${entry.id}`);
    }
  }
  return rows;
}

/** A work file a translator can fill in without touching the repository layout. */
function exportLocale(locale, out) {
  if (!locales().includes(locale)) {
    console.error(`Unknown locale "${locale}". Known: ${locales().join(", ")}`);
    process.exit(1);
  }
  const entries = inspect(locale).filter((entry) => entry.status !== "reviewed");
  const path = out ?? `translations-${locale}.json`;
  writeJson(path, { locale, generated: "on export", entries: entries.map(({ id, status, source, target, sourceHash: hash }) => ({ id, status, source, translation: target, sourceHash: hash })) });
  console.log(`Exported ${entries.length} entries for ${locale} to ${path}.`);
}

/**
 * Import reviewed translations back, with validation.
 *
 * An entry whose sourceHash no longer matches English is refused rather than
 * applied: the translator worked from copy that has since changed, and silently
 * accepting it would mark stale text as reviewed.
 */
function importFile(path) {
  const payload = readJson(path, null);
  if (!payload?.locale || !Array.isArray(payload.entries)) {
    console.error(`${path}: expected { locale, entries: [...] }`);
    process.exit(1);
  }
  const { locale } = payload;
  if (!locales().includes(locale) || locale === SOURCE) {
    console.error(`Cannot import into "${locale}".`);
    process.exit(1);
  }

  const review = readJson(join(ROOT, locale, REVIEW_FILE), {});
  const catalogs = new Map();
  const rejected = [];
  let applied = 0;

  for (const entry of payload.entries) {
    if (entry.translation === null || entry.translation === undefined) continue;
    const [ns, ...rest] = entry.id.split(".");
    const key = rest.join(".");
    const file = `${ns}.json`;
    if (!namespaces().includes(file)) {
      rejected.push(`${entry.id}: no such namespace`);
      continue;
    }
    const source = readJson(join(ROOT, SOURCE, file), {});
    if (!(key in source)) {
      rejected.push(`${entry.id}: not an English key`);
      continue;
    }
    const current = sourceHash(source[key]);
    if (entry.sourceHash && entry.sourceHash !== current) {
      rejected.push(`${entry.id}: English changed since export — re-export and review again`);
      continue;
    }

    if (!catalogs.has(file)) catalogs.set(file, readJson(join(ROOT, locale, file), {}));
    catalogs.get(file)[key] = entry.translation;
    review[entry.id] = { sourceHash: current, reviewedAt: payload.reviewedAt ?? "imported" };
    applied += 1;
  }

  for (const [file, catalog] of catalogs) writeJson(join(ROOT, locale, file), catalog);
  writeJson(join(ROOT, locale, REVIEW_FILE), Object.fromEntries(Object.entries(review).sort(([a], [b]) => a.localeCompare(b))));

  console.log(`Imported ${applied} translations into ${locale}.`);
  if (rejected.length) {
    console.error(`Refused ${rejected.length}:`);
    for (const reason of rejected) console.error(`  ${reason}`);
    process.exit(1);
  }
}

/**
 * The CI gate. Stale and untranslated entries are surfaced, not fatal — a
 * release must be able to ship an English source change before its translations
 * catch up, as long as everyone can see exactly what is outstanding.
 * Missing keys are already fatal in check-messages.mjs.
 */
function check() {
  const rows = report();
  const outstanding = rows.reduce((total, row) => total + row.stale + row.untranslated, 0);
  console.log(outstanding ? `\n${outstanding} entries await human review.` : "\nAll translations are reviewed against the current English source.");
}

const [command, ...rest] = process.argv.slice(2);
switch (command) {
  case "report": report(); break;
  case "check": check(); break;
  case "export": exportLocale(rest[0], rest.includes("--out") ? rest[rest.indexOf("--out") + 1] : undefined); break;
  case "import": importFile(rest[0]); break;
  default:
    console.error("Usage: translations.mjs report | check | export <locale> [--out file] | import <file>");
    process.exit(1);
}
