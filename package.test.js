import assert from "node:assert/strict";
import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));

assert.ok(pkg.keywords.includes("pi-package"));
assert.deepEqual(pkg.pi.extensions, ["./index.js"]);
assert.match(pkg.pi.image, /^https:\/\/raw\.githubusercontent\.com\/AxelMrak\/pi-visual-agents\/main\/assets\/logo\.png$/);
assert.ok(pkg.files.includes("src/"), "runtime modules must be included in the npm tarball");
assert.ok(pkg.files.includes("assets/"), "gallery assets must be included in the npm tarball");
assert.equal(pkg.peerDependencies["@earendil-works/pi-coding-agent"], "*");
assert.equal(pkg.peerDependencies["@earendil-works/pi-tui"], "*");

console.log("package manifest tests passed");
