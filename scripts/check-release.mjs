import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJSON = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));
const manifest = await readJSON("../manifest.json");
const versions = await readJSON("../versions.json");
const pkg = await readJSON("../package.json");

assert.match(manifest.id, /^[a-z]+(?:-[a-z]+)*$/);
assert.ok(!manifest.id.includes("obsidian") && !manifest.id.endsWith("plugin"));
assert.ok(!/obsidian|plugin/i.test(manifest.name));
assert.match(manifest.version, /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
assert.equal(pkg.version, manifest.version);
assert.equal(versions[manifest.version], manifest.minAppVersion);
assert.ok(manifest.description.length <= 250 && manifest.description.endsWith("."));
assert.equal(typeof manifest.isDesktopOnly, "boolean");
assert.ok(manifest.author.trim());

if (process.env.GITHUB_REF_TYPE === "tag") {
  assert.equal(process.env.GITHUB_REF_NAME, manifest.version, "Release tag must exactly match manifest version");
}

console.log("Release metadata checks passed");
