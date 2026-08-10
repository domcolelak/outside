// Hold every locale to the English key space.
//   node scripts/check-messages.mjs
//
// English is the source of truth. A locale that is missing a key would fall back
// silently and ship a half-translated screen; a locale with an extra key is dead
// weight or a typo. Both fail the build, so a release cannot quietly regress
// into English.
//
// Plural entries are compared structurally too: a language whose rules need a
// "few" form must actually provide one, or a count of three renders the wrong
// words with no error anywhere.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "messages");
const SOURCE = "en";

/** Plural categories each locale must supply when a key is a plural entry. */
const REQUIRED_PLURAL_FORMS = {
  en: ["one", "other"],
  sk: ["one", "few", "other"],
  cs: ["one", "few", "other"],
  pl: ["one", "few", "many", "other"],
  hu: ["one", "other"],
};

const problems = [];

/** The {placeholder} names a string interpolates, as a sorted list. */
function placeholders(value) {
  return [...new Set([...String(value).matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

/**
 * A translation that drops or invents an interpolation variable renders a
 * sentence with a hole in it — or a literal "{count}" — which no type check
 * catches because the catalogs are data.
 */
function comparePlaceholders(locale, file, key, sourceValue, targetValue) {
  const expected = placeholders(sourceValue);
  const actual = placeholders(targetValue);
  const missing = expected.filter((name) => !actual.includes(name));
  const unknown = actual.filter((name) => !expected.includes(name));
  if (missing.length) problems.push(`${locale}/${file}: "${key}" drops {${missing.join("}, {")}}`);
  if (unknown.length) problems.push(`${locale}/${file}: "${key}" adds {${unknown.join("}, {")}} which English does not provide`);
}

function readNamespace(locale, file) {
  const path = join(ROOT, locale, file);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    problems.push(`${locale}/${file}: not valid JSON — ${error.message}`);
    return null;
  }
}

/**
 * Product and brand names must read identically in every language: translating
 * "Guardian" would make a Slovak screenshot unrecognisable to whoever answers
 * the support request about it.
 */
const NONTRANSLATABLE = new Set(
  existsSync(join(ROOT, "nontranslatable.json")) ? JSON.parse(readFileSync(join(ROOT, "nontranslatable.json"), "utf8")).keys : [],
);

const locales = readdirSync(ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (!locales.includes(SOURCE)) {
  console.error(`No ${SOURCE} messages found in ${ROOT}`);
  process.exit(1);
}

const namespaces = readdirSync(join(ROOT, SOURCE)).filter((file) => file.endsWith(".json"));

for (const locale of locales.filter((entry) => entry !== SOURCE)) {
  for (const file of namespaces) {
    const source = readNamespace(SOURCE, file);
    const target = readNamespace(locale, file);
    if (!source) continue;
    if (!target) {
      problems.push(`${locale}/${file}: missing entirely`);
      continue;
    }

    for (const key of Object.keys(source)) {
      if (!(key in target)) {
        problems.push(`${locale}/${file}: missing key "${key}"`);
        continue;
      }

      const sourceIsPlural = typeof source[key] === "object" && source[key] !== null;
      const targetIsPlural = typeof target[key] === "object" && target[key] !== null;
      if (sourceIsPlural !== targetIsPlural) {
        problems.push(`${locale}/${file}: "${key}" is ${targetIsPlural ? "plural" : "a string"} but English is ${sourceIsPlural ? "plural" : "a string"}`);
        continue;
      }

      if (sourceIsPlural) {
        for (const form of REQUIRED_PLURAL_FORMS[locale] ?? ["other"]) {
          if (typeof target[key][form] !== "string" || !target[key][form]) {
            problems.push(`${locale}/${file}: "${key}" needs a "${form}" plural form for this language`);
            continue;
          }
          // English may only carry one/other; compare each form against the
          // source form it derives from, falling back to "other".
          comparePlaceholders(locale, file, `${key}.${form}`, source[key][form] ?? source[key].other, target[key][form]);
        }
      } else {
        comparePlaceholders(locale, file, key, source[key], target[key]);
      }

      if (NONTRANSLATABLE.has(`${file.replace(/\.json$/, "")}.${key}`) && JSON.stringify(target[key]) !== JSON.stringify(source[key])) {
        problems.push(`${locale}/${file}: "${key}" is a product name and must read exactly as it does in English`);
      }
    }

    for (const key of Object.keys(target)) {
      if (!(key in source)) problems.push(`${locale}/${file}: unknown key "${key}" (not in English)`);
    }
  }

  // A namespace present only in a translation is unreachable by the loader.
  for (const file of readdirSync(join(ROOT, locale)).filter((entry) => entry.endsWith(".json"))) {
    if (!namespaces.includes(file)) problems.push(`${locale}/${file}: namespace does not exist in English`);
  }
}

if (problems.length) {
  console.error("Message check failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

const keyCount = namespaces.reduce((total, file) => total + Object.keys(readNamespace(SOURCE, file) ?? {}).length, 0);
console.log(`Message check passed: ${locales.length} locales, ${namespaces.length} namespaces, ${keyCount} keys each.`);
