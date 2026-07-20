/**
 * smoke-test.ts — verify the package loads and core pure helpers work.
 *
 * This runs WITHOUT the pi runtime — it only exercises the pure modules
 * (fuzzy, discovery, format) and confirms the extension entry point is
 * importable. A failure here means the package is broken for any consumer.
 */

import { fuzzyScore, fuzzyRank } from "../extensions/fuzzy.ts";
import {
  parseFrontmatter,
  nameFromFile,
  sortByName,
} from "../extensions/discovery.ts";
import { formatList, formatHelp } from "../extensions/format.ts";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`ok  - ${msg}`);
  }
}

// fuzzy
assert(fuzzyScore("abc", "abc") > 0, "exact match scores positive");
assert(fuzzyScore("xyz", "abc") === 0, "non-subsequence scores 0");
assert(fuzzyScore("", "x") === 1, "empty query = neutral match");
const ranked = fuzzyRank("app", ["apple", "banana", "cherry"], (s) => s);
assert(ranked.length === 1 && ranked[0].item === "apple", "rank drops non-matches");

// discovery
const { frontmatter, body } = parseFrontmatter(
  "---\nname: x\ndescription: y\n---\nbody",
);
assert(frontmatter.name === "x", "frontmatter name parsed");
assert(body.trim() === "body", "frontmatter body extracted");
assert(nameFromFile("/a/b/c.md") === "c", "filename → name");
const sorted = sortByName([
  { name: "b", description: "", content: "", kind: "prompt", filePath: "" },
  { name: "a", description: "", content: "", kind: "prompt", filePath: "" },
]);
assert(sorted[0].name === "a", "sortByName orders a before b");

// format
assert(formatList([]) === "No commands found.", "empty list message");
assert(formatHelp().includes("list"), "help mentions list");

// entry point import
try {
  await import("../extensions/index.ts");
  console.log("ok  - extension entry point imports cleanly");
} catch (err) {
  console.error("FAIL: extension entry point import:", err);
  failures++;
}

if (failures > 0) {
  console.error(`\n${failures} smoke-test failure(s)`);
  process.exit(1);
}
console.log("\nAll smoke checks passed.");
