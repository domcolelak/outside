// Prevent customer-facing copy from bypassing the locale catalogs.
//
// The check walks JSX syntax rather than grepping source, so class names, data
// attributes, imports, and comments are ignored. Brand names, standards, and
// protocol identifiers are the only intentional literal UI labels.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = [join(ROOT, "app"), join(ROOT, "components")];
const DISPLAY_ATTRIBUTES = new Set(["alt", "aria-label", "placeholder", "title"]);

const ALLOWED_LITERAL_PATTERNS = [
  /^OUTSIDE$/,
  /^Guardian$/,
  /^Agency Suite$/,
  /^OIDC$/,
  /^CNAME$/,
  /^HTTPS?$/i,
  /^SIEM(?:\s*\/\s*SOAR(?:\s*\/\s*ITSM)?)?$/,
  /^(?:SOC 2|SOC2|ISO 27001|NIS2|DORA)(?:\s*[·/]\s*(?:SOC 2|SOC2|ISO 27001|NIS2|DORA))*$/,
  /^(?:Splunk HEC|Elastic Security|IBM QRadar|Google Chronicle|Cortex XSOAR|PagerDuty|Opsgenie)$/,
  /^(?:Cloudflare|AWS Route 53|Azure DNS|Google Cloud DNS)$/,
  /^https:\/\/$/,
  /^v$/,
  /^s(?:\s*·)?$/,
  /^VeDomEll s\. r\. o\. · Alžbetina 55, 040 01 Košice, Slovakia · IČO 52498751$/,
  /^SOC 2 · ISO · NIS2 · DORA$/,
  /^\/api\/enterprise\/graphql$/,
  /^· SHA-256$/,
  /^Δ$/,
  /^yourcompany\.com$/,
  /^CNAME →$/,
];

const problems = [];

function filesBelow(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesBelow(path) : extname(path) === ".tsx" ? [path] : [];
  });
}

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

function isDisplayCopy(value) {
  const text = normalize(value);
  if (!text || !/\p{L}/u.test(text)) return false;
  return !ALLOWED_LITERAL_PATTERNS.some((pattern) => pattern.test(text));
}

function report(file, sourceFile, node, value) {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  problems.push(`${relative(ROOT, file)}:${position.line + 1} hardcodes UI copy: ${JSON.stringify(normalize(value))}`);
}

for (const file of SOURCE_ROOTS.flatMap(filesBelow)) {
  const source = readFileSync(file, "utf8");
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  function visit(node) {
    if (ts.isJsxText(node) && isDisplayCopy(node.text)) report(file, sourceFile, node, node.text);

    if (ts.isJsxAttribute(node) && DISPLAY_ATTRIBUTES.has(node.name.text) && node.initializer && ts.isStringLiteral(node.initializer)) {
      if (isDisplayCopy(node.initializer.text)) report(file, sourceFile, node, node.initializer.text);
    }

    if (ts.isJsxExpression(node) && node.expression && (ts.isStringLiteral(node.expression) || ts.isNoSubstitutionTemplateLiteral(node.expression))) {
      if (isDisplayCopy(node.expression.text)) report(file, sourceFile, node, node.expression.text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

if (problems.length) {
  console.error("Localized UI check failed:");
  for (const problem of problems) console.error(`- ${problem}`);
  console.error("Move display copy to messages/<locale> or explicitly allow a stable technical/product name.");
  process.exit(1);
}

console.log("Localized UI check passed: JSX display copy is catalog-backed.");
