import { readFile } from "node:fs/promises";

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const overrides = new Map([
  ["png-js", "MIT"],
  // Ships an MIT LICENSE file but omits the license field from package.json.
  ["seq-queue", "MIT"],
]);
const denied = /\b(?:AGPL|GPL|SSPL|BUSL)-[0-9.]+/i;
const inventory = new Map();
const failures = [];

for (const [path, metadata] of Object.entries(lock.packages ?? {})) {
  if (!path.startsWith("node_modules/") || !metadata) continue;
  const name = path.slice("node_modules/".length);
  const license = metadata.license || overrides.get(name);
  if (!license) failures.push(`${name}@${metadata.version ?? "unknown"}: missing licence metadata`);
  else if (denied.test(license)) failures.push(`${name}@${metadata.version ?? "unknown"}: denied licence ${license}`);
  const names = inventory.get(license ?? "UNKNOWN") ?? [];
  names.push(`${name}@${metadata.version ?? "unknown"}`);
  inventory.set(license ?? "UNKNOWN", names);
}

for (const [license, packages] of [...inventory].sort(([left], [right]) => left.localeCompare(right))) {
  console.log(`${license}: ${packages.length}`);
}
if (failures.length) {
  console.error(`\nLicence audit failed:\n${failures.map((item) => `- ${item}`).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(`\nLicence audit passed for ${[...inventory.values()].reduce((sum, items) => sum + items.length, 0)} locked packages.`);
}

