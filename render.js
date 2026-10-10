const ROLE_GLYPHS = { researcher: "⌕", reviewer: "✓", scout: "⌖", worker: "⌁", oracle: "◇", delegate: "⇢", "evidence-auditor": "≡" };
const COLORS = { queued: "36", running: "33", done: "32", error: "31", cancelled: "90" };
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
export const RUNNING_FRAMES = ["◐", "◓", "◑", "◒"];
export const width = visibleWidth;
export const truncate = (text, max) => truncateToWidth(String(text), Math.max(0, max));
export function badge(run, columns = 80, now = Date.now(), hint = "", frame = 0) {
  const state = run.state;
  const spinner = RUNNING_FRAMES[((frame % RUNNING_FRAMES.length) + RUNNING_FRAMES.length) % RUNNING_FRAMES.length];
  const status = ({ queued: "◌ QUEUED", running: `${spinner} RUNNING`, done: "✓ DONE", error: "! ERROR", cancelled: "- CANCELLED" })[state] || "? UNKNOWN";
  const elapsed = Math.max(0, Math.floor(((run.finishedAt || now) - (run.startedAt || now)) / 1000));
  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const role = run.workflow ? "WORKFLOW" : (typeof run.role === "string" && /^[a-z][a-z0-9_-]{0,31}$/i.test(run.role) ? run.role : "subagent");
  const glyph = ROLE_GLYPHS[role] || "•";
  const head = `⟦ ${glyph} ${role.toUpperCase()} ⟧  ${status} · ${duration}`;
  const hintWidth = hint ? visibleWidth(hint) + 1 : 0;
  const showHint = hint && columns > hintWidth && columns - hintWidth >= Math.min(24, visibleWidth(head));
  const clippedHead = showHint ? truncate(head, columns - hintWidth) : "";
  const header = showHint
    ? `${clippedHead}${" ".repeat(Math.max(0, columns - hintWidth - visibleWidth(clippedHead)))} ${hint}`
    : truncate(head, Math.max(1, columns));
  const activity = truncate(run.activity || "Subagent activity", Math.max(1, columns));
  const ansi = (s, code) => `\x1b[${code}m${s}\x1b[0m`;
  const code = COLORS[state] || COLORS.running;
  const children = (run.workflowChildren || []).slice(0, 3).map(child => {
    const childState = child.state;
    const childStatus = ({ queued: "◌ QUEUED", running: `${spinner} RUNNING`, done: "✓ DONE", error: "! ERROR", cancelled: "- CANCELLED", unknown: "? UNKNOWN" })[childState] || "? UNKNOWN";
    const childCode = COLORS[childState] || "90";
    const childAgent = typeof child.agent === "string" && /^[a-z][a-z0-9_-]{0,31}$/i.test(child.agent) ? child.agent : "subagent";
    const childGlyph = ROLE_GLYPHS[childAgent] || "•";
    return ansi(truncate(`  ${childGlyph} ${childAgent.toUpperCase()} · ${childStatus} — ${child.summary}`, Math.max(1, columns)), childCode);
  });
  return [ansi(header, code), ...(children.length ? children : [activity])];
}
export function statusState(status) {
  if (["complete", "completed", "success", "done"].includes(status)) return "done";
  if (["failed", "error", "partial", "rejected"].includes(status)) return "error";
  if (["stopped", "cancelled", "canceled"].includes(status)) return "cancelled";
  if (status === "queued") return "queued";
  return status === "running" ? "running" : undefined;
}
const PRIVATE_FILE = /(?:^|[._-])(?:env|auth|key|secret|token|password|cookie|credential)(?:$|[._-])/i;
function fileDetail(args) {
  const candidate = typeof args === "string" ? args : args?.path ?? args?.file_path ?? args?.filePath;
  if (typeof candidate !== "string" || !candidate || /[\r\n\x00]/.test(candidate)) return "";
  const name = candidate.split(/[\\/]/).filter(Boolean).at(-1);
  if (!name) return "";
  return PRIVATE_FILE.test(name) ? "<private file>" : name.replace(/[^\x20-\x7e]/g, "_").slice(0, 80);
}
function safeToolDetail(entry) {
  if (!entry || typeof entry !== "object") return "";
  const tool = typeof entry.tool === "string" ? entry.tool.toLowerCase() : "";
  if (tool === "read" || tool === "write" || tool === "edit") {
    const file = fileDetail(entry.args);
    return file ? `${tool[0].toUpperCase()}${tool.slice(1)} ${file}` : tool[0].toUpperCase() + tool.slice(1);
  }
  if (tool === "bash") {
    const command = typeof entry.args === "string" ? entry.args : entry.args?.command;
    if (typeof command === "string" && /^[a-z0-9_.-]+(?:\s+[a-z0-9_.-]+)?$/i.test(command)) {
      const [exe, operation] = command.trim().split(/\s+/);
      const allowed = { git: new Set(["status", "diff", "log"]), bun: new Set(["test", "run", "check"]), npm: new Set(["test", "run"]), node: new Set(["--check"]) };
      if (allowed[exe.toLowerCase()]?.has(operation?.toLowerCase())) return `Bash: ${exe} ${operation}`;
      if (!operation && ["pwd", "date"].includes(exe.toLowerCase())) return `Bash: ${exe}`;
    }
    return "Bash";
  }
  return /^[a-z][a-z0-9_-]{0,23}$/i.test(tool) ? tool : "Tool";
}
export function activityFromStatus(snapshot) {
  const state = statusState(snapshot?.state);
  if (state === "done") return "Subagent completed";
  if (state === "error") return "Subagent failed";
  if (state === "cancelled") return "Subagent stopped";
  const step = Array.isArray(snapshot?.steps) ? snapshot.steps[snapshot.currentStep || 0] : undefined;
  const recent = step?.recentTools?.at?.(-1);
  if (recent) return safeToolDetail(recent) || (typeof recent.tool === "string" ? `Using ${recent.tool}` : "Subagent running");
  const tool = step?.currentTool || step?.progress?.currentTool || snapshot?.currentTool || snapshot?.progress?.currentTool;
  if (typeof tool === "string" && /^[a-z][a-z0-9_-]{0,23}$/i.test(tool)) return `Using ${tool}`;
  if (state === "queued") return "Waiting to start";
  if (snapshot?.mode === "workflow" && state === "running") return "Workflow step running";
  return state === "running" ? "Subagent running" : "Subagent activity";
}
