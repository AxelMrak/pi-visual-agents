const SAFE_AGENT = /^[a-z][a-z0-9_-]{0,31}$/i;
const SAFE_TOOL = /^[a-z][a-z0-9_-]{0,23}$/i;
const SAFE_CHILD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;
const PRIVATE_WORD = /(?:secret|token|password|prompt|private|credential|key)/i;
const PRIVATE_FILE = /(?:^|[._-])(?:env|auth|key|secret|token|password|cookie|credential)(?:$|[._-])/i;

export function safeAgent(value, fallback = "subagent") {
  return typeof value === "string" && SAFE_AGENT.test(value) ? value : fallback;
}

export function safeTool(value) {
  return typeof value === "string" && SAFE_TOOL.test(value) ? value : "";
}

export function safeActivity(value) {
  if (typeof value !== "string") return "Subagent activity";
  const normalized = value.replace(/[\r\n\t\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > 120 || /[^\x20-\x7e]/.test(normalized)) return "Subagent activity";
  return normalized;
}

export function safeChildSummary(childId) {
  if (typeof childId !== "string" || childId.length > 48 || !SAFE_CHILD_ID.test(childId) || PRIVATE_WORD.test(childId)) {
    return "Workflow task";
  }
  return childId
    .split("-")
    .map((word, index) => index === 0 ? word[0].toUpperCase() + word.slice(1) : word)
    .join(" ");
}

function fileDetail(args) {
  const candidate = typeof args === "string" ? args : args?.path ?? args?.file_path ?? args?.filePath;
  if (typeof candidate !== "string" || !candidate || /[\r\n\x00]/.test(candidate)) return "";
  const name = candidate.split(/[\\/]/).filter(Boolean).at(-1);
  if (!name) return "";
  return PRIVATE_FILE.test(name) ? "<private file>" : name.replace(/[^\x20-\x7e]/g, "_").slice(0, 80);
}

export function safeToolDetail(entry) {
  if (!entry || typeof entry !== "object") return "";
  const tool = typeof entry.tool === "string" ? entry.tool.toLowerCase() : "";

  if (["read", "write", "edit"].includes(tool)) {
    const file = fileDetail(entry.args);
    const label = tool[0].toUpperCase() + tool.slice(1);
    return file ? `${label} ${file}` : label;
  }

  if (tool === "bash") {
    const command = typeof entry.args === "string" ? entry.args : entry.args?.command;
    if (typeof command === "string" && /^[a-z0-9_.-]+(?:\s+[a-z0-9_.-]+)?$/i.test(command)) {
      const [exe, operation] = command.trim().split(/\s+/);
      const allowed = {
        git: new Set(["status", "diff", "log"]),
        bun: new Set(["test", "run", "check"]),
        npm: new Set(["test", "run"]),
        node: new Set(["--check"]),
      };
      if (allowed[exe.toLowerCase()]?.has(operation?.toLowerCase())) return `Bash: ${exe} ${operation}`;
      if (!operation && ["pwd", "date"].includes(exe.toLowerCase())) return `Bash: ${exe}`;
    }
    return "Bash";
  }

  return SAFE_TOOL.test(tool) ? tool : "Tool";
}
