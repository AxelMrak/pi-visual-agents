import fs from "node:fs";
import path from "node:path";
import {
  ANIMATION_MS,
  FINISHED_RETENTION_MS,
  FLEET_HINT,
  MAX_TRACKED_RUNS,
  MAX_VISIBLE_RUNS,
  REFRESH_MS,
  WIDGET_KEY,
} from "./constants.js";
import { badge } from "./render.js";
import { safeAgent, safeTool } from "./safety.js";
import {
  activityFromStatus,
  applyStatusSnapshot,
  isTerminalState,
  markTerminal,
  resultAsyncDir,
  statusState,
} from "./status.js";

function trimRunHistory(runs) {
  while (runs.size > MAX_TRACKED_RUNS) {
    const finished = [...runs].find(([, run]) => run.finishedAt);
    runs.delete((finished || runs.entries().next().value)[0]);
  }
}

function readSnapshot(run) {
  if (!run.asyncDir || isTerminalState(run.state)) return;
  try {
    const snapshot = JSON.parse(fs.readFileSync(path.join(run.asyncDir, "status.json"), "utf8"));
    applyStatusSnapshot(run, snapshot);
  } catch {
    // Status artifacts can disappear between polls; keep the last verified state.
  }
}

export default function registerVisualAgents(pi) {
  const runs = new Map();
  let context;
  let pollTimer;
  let animationTimer;
  let animationFrame = 0;
  let disposed = false;

  const syncAnimation = () => {
    const shouldAnimate = [...runs.values()].some(run => run.state === "running");
    if (shouldAnimate && !animationTimer) {
      animationTimer = setInterval(() => {
        animationFrame += 1;
        context?.ui.requestRender?.();
      }, ANIMATION_MS);
      animationTimer.unref?.();
      return;
    }

    if (!shouldAnimate && animationTimer) {
      clearInterval(animationTimer);
      animationTimer = undefined;
      animationFrame = 0;
    }
  };

  const redraw = () => {
    syncAnimation();
    if (!context?.hasUI || disposed) return;

    const visible = [...runs.values()].slice(-MAX_VISIBLE_RUNS);
    if (!visible.length) {
      context.ui.setWidget(WIDGET_KEY, undefined);
      return;
    }

    context.ui.setWidget(WIDGET_KEY, (_tui, theme) => ({
      render(columns) {
        return visible.flatMap((run, index) => {
          const hint = index === 0 && visible.length > 1 ? FLEET_HINT : "";
          return badge(run, columns, Date.now(), hint, animationFrame).map((line, lineIndex) =>
            lineIndex === 0 ? theme.fg("accent", line) : theme.fg("dim", line),
          );
        });
      },
      invalidate() {},
    }));
    context.ui.requestRender?.();
  };

  const poll = () => {
    const now = Date.now();
    for (const [id, run] of runs) {
      if (run.finishedAt && now - run.finishedAt > FINISHED_RETENTION_MS) runs.delete(id);
    }
    for (const run of runs.values()) readSnapshot(run);
    redraw();
  };

  pi.on("tool_execution_start", (event, ctx) => {
    if (event.toolName !== "subagent" || event.args?.action) return;
    context = ctx || context;
    runs.set(event.toolCallId, {
      id: event.toolCallId,
      role: safeAgent(event.args?.agent),
      state: "running",
      activity: "Starting subagent",
      startedAt: Date.now(),
    });
    trimRunHistory(runs);
    redraw();
  });

  pi.on("tool_execution_update", (event, ctx) => {
    context = ctx || context;
    const run = runs.get(event.toolCallId);
    if (!run) return;

    const details = event.partialResult?.details;
    const asyncDir = resultAsyncDir(details);
    if (asyncDir) {
      run.asyncDir = asyncDir;
      run.runId = details.runId || path.basename(asyncDir);
    }

    const result = details?.results?.[0];
    const progress = details?.progress?.[0] || result?.progress;
    if (typeof result?.agent === "string") run.role = safeAgent(result.agent, run.role);
    if (progress?.status === "running") run.state = "running";

    if (typeof progress?.currentTool === "string") {
      const currentTool = safeTool(progress.currentTool);
      run.activity = currentTool ? `Using ${currentTool}` : "Subagent activity";
    }
    redraw();
  });

  pi.on("tool_execution_end", (event, ctx) => {
    context = ctx || context;
    const run = runs.get(event.toolCallId);
    if (!run) return;

    const details = event.result?.details;
    const asyncDir = resultAsyncDir(details);
    if (asyncDir) {
      run.asyncDir = asyncDir;
      run.runId = details.runId || path.basename(asyncDir);
    }

    const result = details?.results?.[0];
    const status = result?.status || details?.state || details?.status;
    const finalState = statusState(status);
    if (isTerminalState(finalState)) {
      markTerminal(run, finalState, activityFromStatus({ state: status }));
    } else if (event.isError) {
      markTerminal(run, "error", "Subagent failed");
    } else if (run.asyncDir) {
      return;
    }
    redraw();
  });

  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "subagent") return;
    context = ctx;
    const run = runs.get(event.toolCallId);
    if (!run) return;

    const details = event.details;
    const asyncDir = resultAsyncDir(details);
    if (asyncDir) {
      run.asyncDir = asyncDir;
      run.runId = details.runId || path.basename(asyncDir);
    }

    const status = details?.results?.[0]?.status || details?.state || details?.status;
    const finalState = statusState(status);
    if (isTerminalState(finalState)) {
      markTerminal(run, finalState, activityFromStatus({ state: status }));
    }
    poll();
  });

  pi.on("session_start", (_event, ctx) => {
    context = ctx;
    redraw();
  });

  pollTimer = setInterval(poll, REFRESH_MS);
  pollTimer.unref?.();

  pi.on("session_shutdown", () => {
    disposed = true;
    clearInterval(pollTimer);
    clearInterval(animationTimer);
    animationTimer = undefined;
    context?.ui.setWidget(WIDGET_KEY, undefined);
  });
}
