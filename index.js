import fs from "node:fs";
import path from "node:path";
import { activityFromStatus, badge, statusState, truncate } from "./render.js";
const KEY = "pi-visual-agents";
const MAX_RUNS = 3;
const MAX_TRACKED = 12;
const FINISHED_RETENTION_MS = 8_000;
const REFRESH_MS = 1500;
const ANIMATION_MS = 450;
function workflowChildRows(snapshot, trackedRunId) {
  if (snapshot?.runId !== trackedRunId || !Array.isArray(snapshot?.workflowChildren?.children)) return [];
  return snapshot.workflowChildren.children.slice(0, 3).map((child, index) => {
    const id = typeof child?.childId === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(child.childId) && child.childId.length <= 48 && !/(?:secret|token|password|prompt|private|credential|key)/i.test(child.childId) ? child.childId : "";
    const summary = id ? id.split("-").map((word, wordIndex) => wordIndex === 0 ? word[0].toUpperCase() + word.slice(1) : word).join(" ") : "Workflow task";
    const agent = typeof child?.agent === "string" && /^[a-z][a-z0-9_-]{0,31}$/i.test(child.agent) ? child.agent : "subagent";
    return { runId: child?.runId, index, agent, state: statusState(child?.state) || "unknown", summary };
  });
}
function safeActivity(value) {
  if (typeof value !== "string") return "Subagent activity";
  const s = value.replace(/[\r\n\t\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.length > 120 || /[^\x20-\x7e]/.test(s)) return "Subagent activity";
  return s;
}
function markTerminal(run, state, activity, now = Date.now()) {
  if (!run.finishedAt) run.finishedAt = now;
  run.state = state;
  if (activity) run.activity = activity;
}
function resultAsyncDir(details) {
  const candidates = [details?.asyncDir, details?.artifactPaths?.asyncDir, details?.results?.[0]?.asyncDir];
  return candidates.find(x => typeof x === "string" && path.isAbsolute(x));
}
export default function (pi) {
  const runs = new Map();
  let context;
  let timer;
  let animationTimer;
  let animationFrame = 0;
  let disposed = false;
  const syncAnimation = () => {
    const shouldAnimate = [...runs.values()].some(run => run.state === "running");
    if (shouldAnimate && !animationTimer) {
      animationTimer = setInterval(() => {
        animationFrame++;
        context?.ui.requestRender?.();
      }, ANIMATION_MS);
      animationTimer.unref?.();
    } else if (!shouldAnimate && animationTimer) {
      clearInterval(animationTimer);
      animationTimer = undefined;
      animationFrame = 0;
    }
  };
  const redraw = () => {
    syncAnimation();
    if (!context || !context.hasUI || disposed) return;
    const visible = [...runs.values()].slice(-MAX_RUNS);
    if (!visible.length) { context.ui.setWidget(KEY, undefined); return; }
    context.ui.setWidget(KEY, (_tui, theme) => ({
      render(width) { return visible.flatMap((run, index) => badge(run, width, Date.now(), index === 0 && visible.length > 1 ? "TYPE /subagents-fleet" : "", animationFrame).map((line, i) => i === 0 ? theme.fg("accent", line) : theme.fg("dim", line))); },
      invalidate() {},
    }));
    context.ui.requestRender?.();
  };
  const poll = () => {
    for (const [id, run] of runs) {
      if (run.finishedAt && Date.now() - run.finishedAt > FINISHED_RETENTION_MS) runs.delete(id);
    }
    for (const run of runs.values()) {
      if (!run.asyncDir || run.state === "done" || run.state === "error" || run.state === "cancelled") continue;
      try {
        const s = JSON.parse(fs.readFileSync(path.join(run.asyncDir, "status.json"), "utf8"));
        if (s.runId !== run.runId) continue;
        const state = statusState(s.state);
        if (state === "done" || state === "error" || state === "cancelled") markTerminal(run, state, activityFromStatus(s));
        else if (state) run.state = state;
        run.startedAt = s.startedAt || run.startedAt;
        const step = Array.isArray(s.steps) ? s.steps[s.currentStep || 0] : undefined;
        run.role = step?.agent || run.role;
        run.activity = safeActivity(activityFromStatus(s));
        run.workflow = s.mode === "workflow";
        run.workflowChildren = run.workflow ? workflowChildRows(s, run.runId) : [];
      } catch { /* Artifact may be stale/removed; retain last verified state. */ }
    }
    redraw();
  };
  const start = (event, ctx) => {
    if (event.toolName !== "subagent" || event.args?.action) return;
    context = ctx || context;
    const id = event.toolCallId;
    runs.set(id, { id, role: typeof event.args?.agent === "string" ? event.args.agent : "subagent", state: "running", activity: "Starting subagent", startedAt: Date.now() });
    while (runs.size > MAX_TRACKED) {
      const removable = [...runs].find(([, run]) => run.finishedAt);
      runs.delete((removable || runs.entries().next().value)[0]);
    }
    redraw();
  };
  pi.on("tool_execution_start", start);
  pi.on("tool_execution_update", (event, ctx) => {
    context = ctx || context;
    const run = runs.get(event.toolCallId);
    if (!run) return;
    const detail = event.partialResult?.details;
    const dir = resultAsyncDir(detail);
    if (dir) { run.asyncDir = dir; run.runId = detail.runId || path.basename(dir); }
    const result = detail?.results?.[0];
    const progress = detail?.progress?.[0] || result?.progress;
    if (typeof result?.agent === "string") run.role = result.agent;
    if (progress?.status === "running") run.state = "running";
    if (typeof progress?.currentTool === "string") {
      run.activity = /^[a-z][a-z0-9_-]{0,23}$/i.test(progress.currentTool) ? `Using ${progress.currentTool}` : "Subagent activity";
    }
    redraw();
  });
  pi.on("tool_execution_end", (event, ctx) => {
    context = ctx || context;
    const run = runs.get(event.toolCallId);
    if (!run) return;
    const details = event.result?.details;
    const dir = resultAsyncDir(details);
    if (dir) { run.asyncDir = dir; run.runId = details.runId || path.basename(dir); return; }
    if (run.asyncDir) return;
    const result = details?.results?.[0];
    const final = statusState(result?.status || details?.state || details?.status);
    if (final && final !== "running" && final !== "queued") {
      markTerminal(run, final, activityFromStatus({ state: result?.status || details?.state || details?.status }));
    } else if (event.isError) {
      markTerminal(run, "error", "Subagent failed");
    }
    redraw();
  });
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "subagent") return;
    context = ctx;
    const run = runs.get(event.toolCallId);
    if (!run) return;
    const details = event.details;
    const dir = resultAsyncDir(details);
    if (dir) { run.asyncDir = dir; run.runId = details.runId || path.basename(dir); }
    // A successful async launch result is not child completion. Only terminal metadata ends it.
    if (!dir) {
      const final = statusState(details?.state || details?.status);
      if (final === "done" || final === "error" || final === "cancelled") {
        markTerminal(run, final, activityFromStatus({ state: details?.state || details?.status }));
      }
    }
    poll();
  });
  pi.on("session_start", (_event, ctx) => { context = ctx; redraw(); });
  timer = setInterval(poll, REFRESH_MS);
  timer.unref?.();
  pi.on("session_shutdown", () => { disposed = true; clearInterval(timer); clearInterval(animationTimer); animationTimer = undefined; context?.ui.setWidget(KEY, undefined); });
}
