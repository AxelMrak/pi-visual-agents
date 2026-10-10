import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { safeAgent } from "./safety.js";

const ROLE_GLYPHS = {
  researcher: "⌕",
  reviewer: "✓",
  scout: "⌖",
  worker: "⌁",
  oracle: "◇",
  delegate: "⇢",
  "evidence-auditor": "≡",
};

const COLORS = { queued: "36", running: "33", done: "32", error: "31", cancelled: "90" };
const STATUS_LABELS = {
  queued: "◌ QUEUED",
  done: "✓ DONE",
  error: "! ERROR",
  cancelled: "- CANCELLED",
  unknown: "? UNKNOWN",
};

export const RUNNING_FRAMES = ["◐", "◓", "◑", "◒"];
export const width = visibleWidth;
export const truncate = (text, max) => truncateToWidth(String(text), Math.max(0, max));

function ansi(text, code) {
  return `\x1b[${code}m${text}\x1b[0m`;
}

function statusLabel(state, spinner) {
  return state === "running" ? `${spinner} RUNNING` : STATUS_LABELS[state] || STATUS_LABELS.unknown;
}

function elapsedDuration(run, now) {
  const seconds = Math.max(0, Math.floor(((run.finishedAt || now) - (run.startedAt || now)) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function renderHeader(run, columns, now, hint, spinner) {
  const role = run.workflow ? "WORKFLOW" : safeAgent(run.role);
  const glyph = ROLE_GLYPHS[role] || "•";
  const head = `⟦ ${glyph} ${role.toUpperCase()} ⟧  ${statusLabel(run.state, spinner)} · ${elapsedDuration(run, now)}`;
  const hintWidth = hint ? visibleWidth(hint) + 1 : 0;
  const showHint = hint && columns > hintWidth && columns - hintWidth >= Math.min(24, visibleWidth(head));

  if (!showHint) return truncate(head, Math.max(1, columns));

  const clipped = truncate(head, columns - hintWidth);
  return `${clipped}${" ".repeat(Math.max(0, columns - hintWidth - visibleWidth(clipped)))} ${hint}`;
}

function renderChild(child, columns, spinner) {
  const agent = safeAgent(child.agent);
  const glyph = ROLE_GLYPHS[agent] || "•";
  const text = `  ${glyph} ${agent.toUpperCase()} · ${statusLabel(child.state, spinner)} — ${child.summary}`;
  return ansi(truncate(text, Math.max(1, columns)), COLORS[child.state] || "90");
}

export function badge(run, columns = 80, now = Date.now(), hint = "", frame = 0) {
  const spinner = RUNNING_FRAMES[((frame % RUNNING_FRAMES.length) + RUNNING_FRAMES.length) % RUNNING_FRAMES.length];
  const header = renderHeader(run, columns, now, hint, spinner);
  const children = (run.workflowChildren || []).slice(0, 3).map(child => renderChild(child, columns, spinner));
  const body = children.length ? children : [truncate(run.activity || "Subagent activity", Math.max(1, columns))];
  return [ansi(header, COLORS[run.state] || COLORS.running), ...body];
}
