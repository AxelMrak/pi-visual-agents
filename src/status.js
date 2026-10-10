import path from "node:path";
import { MAX_WORKFLOW_CHILDREN } from "./constants.js";
import { safeActivity, safeAgent, safeChildSummary, safeTool, safeToolDetail } from "./safety.js";

const TERMINAL_STATES = new Set(["done", "error", "cancelled"]);

export function statusState(status) {
  if (["complete", "completed", "success", "done"].includes(status)) return "done";
  if (["failed", "error", "partial", "rejected"].includes(status)) return "error";
  if (["stopped", "cancelled", "canceled"].includes(status)) return "cancelled";
  if (status === "queued") return "queued";
  return status === "running" ? "running" : undefined;
}

export function isTerminalState(state) {
  return TERMINAL_STATES.has(state);
}

export function markTerminal(run, state, activity, now = Date.now()) {
  if (!run.finishedAt) run.finishedAt = now;
  run.state = state;
  if (activity) run.activity = activity;
}

export function resultAsyncDir(details) {
  const candidates = [details?.asyncDir, details?.artifactPaths?.asyncDir, details?.results?.[0]?.asyncDir];
  return candidates.find(candidate => typeof candidate === "string" && path.isAbsolute(candidate));
}

export function workflowChildRows(snapshot, trackedRunId) {
  if (snapshot?.runId !== trackedRunId || !Array.isArray(snapshot?.workflowChildren?.children)) return [];

  return snapshot.workflowChildren.children.slice(0, MAX_WORKFLOW_CHILDREN).map((child, index) => ({
    runId: child?.runId,
    index,
    agent: safeAgent(child?.agent),
    state: statusState(child?.state) || "unknown",
    summary: safeChildSummary(child?.childId),
  }));
}

export function activityFromStatus(snapshot) {
  const state = statusState(snapshot?.state);
  if (state === "done") return "Subagent completed";
  if (state === "error") return "Subagent failed";
  if (state === "cancelled") return "Subagent stopped";

  const step = Array.isArray(snapshot?.steps) ? snapshot.steps[snapshot.currentStep || 0] : undefined;
  const recent = step?.recentTools?.at?.(-1);
  if (recent) return safeToolDetail(recent) || (safeTool(recent.tool) ? `Using ${recent.tool}` : "Subagent running");

  const tool = step?.currentTool || step?.progress?.currentTool || snapshot?.currentTool || snapshot?.progress?.currentTool;
  const safe = safeTool(tool);
  if (safe) return `Using ${safe}`;
  if (state === "queued") return "Waiting to start";
  if (snapshot?.mode === "workflow" && state === "running") return "Workflow step running";
  return state === "running" ? "Subagent running" : "Subagent activity";
}

export function applyStatusSnapshot(run, snapshot) {
  if (!snapshot || snapshot.runId !== run.runId) return false;

  const state = statusState(snapshot.state);
  if (isTerminalState(state)) markTerminal(run, state, activityFromStatus(snapshot));
  else if (state) run.state = state;

  run.startedAt = snapshot.startedAt || run.startedAt;
  const step = Array.isArray(snapshot.steps) ? snapshot.steps[snapshot.currentStep || 0] : undefined;
  run.role = safeAgent(step?.agent, run.role);
  run.activity = safeActivity(activityFromStatus(snapshot));
  run.workflow = snapshot.mode === "workflow";
  run.workflowChildren = run.workflow ? workflowChildRows(snapshot, run.runId) : [];
  return true;
}
