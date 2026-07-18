import { opendir, readFile } from "node:fs/promises";

const excludedDirectories = new Set([".git", ".next", ".npm-cache", "node_modules", "coverage", "out", "build", ".terraform"]);
const excludedFiles = new Set(["package-lock.json"]);
async function repositoryFiles(root = ".") {
  const files = [];
  for await (const entry of await opendir(root)) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) files.push(...await repositoryFiles(`${root}/${entry.name}`));
    } else if (entry.isFile() && !excludedFiles.has(entry.name)) files.push(`${root}/${entry.name}`.replace(/^\.\//, ""));
  }
  return files;
}
const tracked = await repositoryFiles();
const rules = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{20,}\b/],
  ["GitHub personal token", /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["OpenAI project key", /\bsk-proj-[A-Za-z0-9_-]{20,}\b/],
];
const findings = [];

for (const file of tracked) {
  if (/^(?:package-lock\.json|docs\/media\/|\.next\/|coverage\/)/.test(file.replaceAll("\\", "/"))) continue;
  let content;
  try { content = await readFile(file, "utf8"); }
  catch { continue; }
  for (const [name, pattern] of rules) if (pattern.test(content)) findings.push(`${file}: ${name}`);
}

if (findings.length) {
  console.error(`Secret scan failed:\n${findings.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else console.log(`Secret scan passed for ${tracked.length} repository files.`);
