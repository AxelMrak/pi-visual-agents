import assert from "node:assert/strict";
import { activityFromStatus, badge, RUNNING_FRAMES, statusState, truncate, width } from "./render.js";
const cases = [
  ["queued", "◌ QUEUED"], ["running", "RUNNING"], ["done", "✓ DONE"], ["error", "! ERROR"], ["cancelled", "- CANCELLED"],
];
for (const [state, label] of cases) {
  const [head, activity] = badge({ role: "researcher", state, startedAt: 0, activity: "Read source file" }, 100, 42_000);
  assert.match(head, /⌕ RESEARCHER/);
  assert.match(head, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(activity, "Read source file");
}
assert.equal(statusState("complete"), "done");
assert.equal(statusState("done"), "done");
assert.equal(statusState("failed"), "error");
assert.equal(statusState("stopped"), "cancelled");
assert.equal(statusState("unknown"), undefined);
for (let i = 0; i < RUNNING_FRAMES.length; i++) {
  const active = badge({ role: "worker", state: "running", startedAt: 0 }, 80, 1000, "", i)[0];
  assert.ok(active.includes(RUNNING_FRAMES[i]));
  assert.ok(active.includes("RUNNING"));
}
for (const state of ["queued", "done", "error", "cancelled"]) {
  const a = badge({ role: "worker", state, startedAt: 0 }, 80, 1000, "", 0)[0];
  const b = badge({ role: "worker", state, startedAt: 0 }, 80, 1000, "", 3)[0];
  assert.equal(a, b, `${state} symbol must not animate`);
}
assert.equal(activityFromStatus({ state: "running", mode: "single", currentStep: 0, steps: [{ status: "running", recentTools: [{ tool: "read", args: { path: "/private/project/render.js" }, endMs: 42 }] }] }), "Read render.js");
assert.equal(activityFromStatus({ state: "running", steps: [{ recentTools: [{ tool: "write", args: { path: "/private/project/index.js" } }] }] }), "Write index.js");
for (const name of [".env", "auth.json", "id_key.pem", "api-secret.txt", "token", "password.txt", "cookie", "credential.json"]) {
  const detail = activityFromStatus({ state: "running", steps: [{ recentTools: [{ tool: "read", args: { path: `/private/${name}` } }] }] });
  assert.equal(detail, "Read <private file>");
  assert.ok(!detail.includes(name));
}
const unsafeBash = activityFromStatus({ state: "running", steps: [{ recentTools: [{ tool: "bash", args: { command: "bun test --env SECRET=topsecret /private/path" } }] }] });
assert.equal(unsafeBash, "Bash");
assert.ok(!/topsecret|SECRET|private|bun test/.test(unsafeBash));
assert.equal(activityFromStatus({ state: "running", steps: [{ recentTools: [{ tool: "bash", args: { command: "bun test" } }] }] }), "Bash: bun test");
const hostile = activityFromStatus({ state: "running", steps: [{ recentTools: [{ tool: "read", args: { path: "/x/safe.js" } }] }], task: "launcher prompt must not appear" });
assert.equal(hostile, "Read safe.js");
assert.ok(!hostile.includes("launcher prompt"));
assert.equal(activityFromStatus({ state: "running", steps: [{ recentTools: [{ tool: "custom_TOOL", args: "secret prompt" }] }] }), "custom_tool");
assert.ok(width(badge({ role: "worker", state: "running", activity: "Read a-very-long-filename.js" }, 14)[1]) <= 14);
const multipleHeader = badge({ role: "worker", state: "running", activity: "ok" }, 100, 1000, "TYPE /subagents-fleet")[0].replace(/\x1b\[[0-9;]*m/g, "");
assert.ok(multipleHeader.includes("TYPE /subagents-fleet"), "native inspector command is shown as typing guidance");
assert.ok(width(multipleHeader) <= 100);
assert.ok(!badge({ role: "worker", state: "running", activity: "ok" }, 80, 1000, "")[0].includes("/subagents-fleet"));
assert.ok(!badge({ role: "worker", state: "running", activity: "ok" }, 30, 1000, "TYPE /subagents-fleet")[0].includes("/subagents-fleet"));
assert.ok(!multipleHeader.includes("ctrl+alt") && !multipleHeader.includes("⌃⌥"));
assert.equal(activityFromStatus({ state: "running", mode: "workflow", currentStep: 1, steps: [{ status: "completed", agent: "researcher" }, { status: "running", agent: "worker" }] }), "Workflow step running");
assert.equal(activityFromStatus({ state: "complete", mode: "workflow", steps: [{ status: "completed" }] }), "Subagent completed");
assert.equal(activityFromStatus({ state: "failed", mode: "single" }), "Subagent failed");
assert.equal(activityFromStatus({ state: "stopped", mode: "single" }), "Subagent stopped");
assert.ok(width(truncate("⟦ ⌕ RESEARCHER ⟧", 8)) <= 8);
assert.ok(width(truncate("\x1b[31mabcdef\x1b[0m", 4)) <= 4);
assert.ok(!/😀/.test(badge({ role: "researcher", state: "running", startedAt: 0, activity: "ok" })[0]));
assert.match(badge({ role: "\x1b[31mBAD", state: "running", startedAt: 0, activity: "ok" })[0].replace(/\x1b\[[0-9;]*m/g, ""), /SUBAGENT/);
console.log("render tests passed");
