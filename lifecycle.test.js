import assert from "node:assert/strict";
import fs from "node:fs";
import register from "./index.js";
const originalSetInterval = globalThis.setInterval;
const originalClearInterval = globalThis.clearInterval;
const originalNow = Date.now;
let now;
let baseNow;
let poll;
let animationTick;
let activeAnimationTimer;
let animationStarts = 0;
let animationStops = 0;
let renderRequests = 0;
let widget;
const handlers = new Map();
let shortcutRegistered = false;
const pi = {
  on(name, fn) { const list = handlers.get(name) || []; list.push(fn); handlers.set(name, list); },
  registerShortcut() { shortcutRegistered = true; },
};
const ui = {
  setWidget(_key, value) { widget = value; }, requestRender() { renderRequests++; },
};
const ctx = { hasUI: true, ui };
const fire = (name, event, context = ctx) => { for (const fn of handlers.get(name) || []) fn(event, context); };
const visibleLines = () => widget?.({}, { fg: (_name, text) => text }).render(100).join("\\n").replace(/\\x1b\\[[0-9;]*m/g, "") || "";
try {
  now = 1_800_000_000_000;
  baseNow = now;
  Date.now = () => now;
  globalThis.setInterval = (fn, ms) => {
    const handle = { ms, fn, unref() {} };
    if (ms === 1500) poll = fn;
    if (ms === 450) { animationTick = fn; activeAnimationTimer = handle; animationStarts++; }
    return handle;
  };
  globalThis.clearInterval = handle => { if (handle === activeAnimationTimer) { activeAnimationTimer = undefined; animationStops++; } };
  register(pi);
  assert.equal(shortcutRegistered, false, "visual agents must not register a custom selector shortcut");
  fire("tool_execution_start", { toolName: "subagent", toolCallId: "terminal-result", args: { agent: "researcher", task: "SECRET LAUNCHER PROMPT" } });
  assert.equal(animationStarts, 1, "animation timer starts for running badge");
  const beforeAnimation = renderRequests;
  animationTick();
  assert.equal(renderRequests, beforeAnimation + 1, "animation frame only requests a UI redraw");
  fire("tool_execution_start", { toolName: "subagent", toolCallId: "second-agent", args: { agent: "worker", task: "private prompt" } });
  const header = widget?.({}, { fg: (_name, text) => text }).render(100)[0].replace(/\x1b\[[0-9;]*m/g, "");
  assert.match(header, /TYPE \/subagents-fleet/, "native command hint appears when multiple runs are visible");
  assert.ok(!header.includes("ctrl+alt") && !header.includes("⌃⌥"), "hint is not presented as a keyboard shortcut");
  assert.ok(!visibleLines().includes("SECRET LAUNCHER PROMPT"));
  assert.ok(!visibleLines().includes("private prompt"));
  fire("tool_execution_end", { toolCallId: "second-agent", result: { details: { results: [{ status: "completed" }] } } });
  now += 8_500;
  poll();
  now = baseNow;
  const loneHeader = widget?.({}, { fg: (_name, text) => text }).render(100)[0].replace(/\x1b\[[0-9;]*m/g, "");
  assert.ok(!loneHeader.includes("/subagents-fleet"), "hint hides for one visible run");
  assert.match(visibleLines(), /Starting subagent/, "new run starts with an explicit fallback activity");
  fire("tool_execution_update", { toolCallId: "terminal-result", partialResult: { details: { mode: "single", results: [{ agent: "researcher" }], progress: [{ currentTool: "read" }] } } });
  assert.match(visibleLines(), /Using read/, "public single-run update replaces stale start text");
  fire("tool_execution_update", { toolCallId: "terminal-result", partialResult: { details: { mode: "single", progress: [{ currentTool: "bash /secret/token" }] } } });
  assert.ok(!visibleLines().includes("/secret/token"));
  assert.ok(!visibleLines().includes("secret"));
  assert.match(visibleLines(), /Subagent activity/);

  const originalReadFileSync = fs.readFileSync;
  let fixture;
  let statusReads = 0;
  fs.readFileSync = (file, ...args) => { if (String(file).endsWith("/status.json") && fixture) { statusReads++; return JSON.stringify(fixture); } return originalReadFileSync(file, ...args); };
  try {
    fire("tool_result", { toolName: "subagent", toolCallId: "terminal-result", details: { mode: "workflow", asyncDir: "/virtual/workflow", runId: "workflow-1" } });
    fixture = { runId: "workflow-old", mode: "workflow", state: "running", workflowChildren: { children: [{ childId: "child-old", runId: "child-old-run", agent: "reviewer", state: "failed", sessionName: "PRIVATE PROMPT" }] } };
    poll();
    assert.ok(statusReads > 0, "matching status file fixture was read");
    assert.ok(!visibleLines().includes("PRIVATE PROMPT"));
    assert.ok(!visibleLines().includes("reviewer"), "stale root run snapshot must be ignored");
    fixture = { runId: "workflow-1", mode: "workflow", state: "running", workflowChildren: { children: [
      { childId: "review-visual-agent-safety", runId: "child-running", agent: "reviewer", state: "running", sessionName: "PRIVATE PROMPT", task: "SECRET" },
      { childId: "worker-step", runId: "child-done", agent: "worker", state: "done", task: "DO NOT SHOW OBJECTIVE" },
      { childId: "scout-step", runId: "child-error", agent: "scout", state: "error", title: "DO NOT SHOW TITLE" },
      { childId: "oracle-step", runId: "child-extra", agent: "oracle", state: "running" },
    ] } };
    poll();
    assert.ok(statusReads > 1, "current workflow snapshot was read after stale snapshot");
    assert.match(visibleLines(), /WORKFLOW/);
    assert.match(visibleLines(), /✓ REVIEWER · .* RUNNING — Review visual agent safety/);
    assert.match(visibleLines(), /WORKER · ✓ DONE — Worker step/);
    assert.equal((visibleLines().match(/Review visual agent safety/g) || []).length, 1, "workflow child rows render once");
    assert.ok(!visibleLines().includes("PRIVATE PROMPT"));
    assert.ok(!visibleLines().includes("SECRET"));
    fixture = { runId: "workflow-1", mode: "workflow", state: "running", workflowChildren: { children: [{ childId: "bad-private-name", runId: "child-fallback", state: "mystery", title: "PRIVATE OBJECTIVE" }, { runId: "child-missing", childId: "" }] } };
    poll();
    assert.ok(visibleLines().includes("UNKNOWN"));
    assert.ok(visibleLines().includes("Workflow task"));
  } finally {
    fs.readFileSync = originalReadFileSync;
  }
  fire("tool_execution_start", { toolName: "subagent", toolCallId: "async-end-terminal", args: { agent: "reviewer" } });
  fire("tool_execution_end", { toolCallId: "async-end-terminal", result: { details: { state: "completed", asyncDir: "/virtual/async-end-terminal", runId: "async-end-terminal-run" } } });
  assert.match(visibleLines(), /REVIEWER.*DONE/, "tool execution terminal state wins when artifact directory is present");
  fire("tool_execution_start", { toolName: "subagent", toolCallId: "async-result-terminal", args: { agent: "worker" } });
  fire("tool_result", { toolName: "subagent", toolCallId: "async-result-terminal", details: { results: [{ status: "completed" }], asyncDir: "/virtual/async-result-terminal", runId: "async-result-terminal-run" } });
  assert.match(visibleLines(), /WORKER.*DONE/, "tool result terminal state wins when artifact directory is present");

  now += 4_000;
  fire("tool_result", { toolName: "subagent", toolCallId: "terminal-result", details: { state: "complete" } });
  assert.match(visibleLines(), /DONE · 00:04/, "terminal duration should freeze at completion");
  assert.equal(animationStops, 1, "animation timer stops when no runs are running");
  now += 2_000;
  fire("tool_result", { toolName: "subagent", toolCallId: "terminal-result", details: { state: "complete" } });
  assert.match(visibleLines(), /DONE · 00:04/, "duplicate terminal events must not reset finish time");
  now += 6_500;
  poll();
  assert.equal(widget, undefined, "terminal tool_result badge must disappear within eight seconds");

  fire("tool_execution_start", { toolName: "subagent", toolCallId: "failure", args: { agent: "reviewer" } });
  fire("tool_execution_end", { toolCallId: "failure", result: { details: { results: [{ status: "failed" }] } }, isError: true });
  assert.match(visibleLines(), /ERROR/, "failed execution result must be retained visibly");
  fire("tool_execution_start", { toolName: "subagent", toolCallId: "cancel", args: { agent: "worker" } });
  fire("tool_execution_end", { toolCallId: "cancel", result: { details: { results: [{ status: "stopped" }] } }, isError: false });
  assert.match(visibleLines(), /CANCELLED/, "stopped execution result maps to cancelled");
  now += 8_500;
  poll();
  assert.equal(widget, undefined, "error and cancelled badges also expire after terminal retention");

  fire("tool_execution_start", { toolName: "subagent", toolCallId: "active", args: { agent: "worker" } });
  now += 60 * 60_000;
  poll();
  assert.notEqual(widget, undefined, "active badge must not expire");
  assert.equal(activeAnimationTimer?.ms, 450, "running animation interval is bounded at 450ms");
  fire("session_shutdown", {});
  assert.equal(activeAnimationTimer, undefined, "shutdown clears the animation interval");
} finally {
  Date.now = originalNow;
  globalThis.setInterval = originalSetInterval;
  globalThis.clearInterval = originalClearInterval;
}
console.log("lifecycle tests passed");
