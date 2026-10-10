import fs from "node:fs";
import path from "node:path";
import { badge } from "../render.js";

const outputDir = path.resolve("demo/.frames");
fs.mkdirSync(outputDir, { recursive: true });
const stripAnsi = value => value.replace(/\x1b\[[0-9;]*m/g, "");
const escapeXml = value => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const frame = (index, lines) => {
  const body = lines.map((line, row) => `<text x="48" y="${64 + row * 34}" class="line">${escapeXml(line)}</text>`).join("\n");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="260" viewBox="0 0 1100 260">
  <rect width="1100" height="260" fill="#081018"/>
  <rect x="24" y="24" width="1052" height="212" rx="8" fill="#101c26" stroke="#31566b" stroke-width="2"/>
  <circle cx="52" cy="48" r="6" fill="#f45b69"/><circle cx="72" cy="48" r="6" fill="#f2c14e"/><circle cx="92" cy="48" r="6" fill="#5bc98b"/>
  <style>.line{font:22px monospace;fill:#d6e7ef;white-space:pre}.line:first-child{fill:#f2c14e;font-weight:bold}</style>
  ${body}
</svg>`;
  fs.writeFileSync(path.join(outputDir, `frame-${String(index).padStart(2, "0")}.svg`), svg);
};

const single = state => badge({ role: "researcher", state, startedAt: 0, finishedAt: state === "done" ? 8_000 : undefined, activity: state === "done" ? "Subagent completed" : "Read render.js" }, 100, 8_000, "", state === "running" ? 0 : 1).map(stripAnsi);
const workflow = badge({ workflow: true, state: "running", startedAt: 0, workflowChildren: [
  { agent: "reviewer", state: "running", summary: "Review visual agent safety" },
  { agent: "worker", state: "done", summary: "Worker step" },
  { agent: "scout", state: "error", summary: "Scout step" },
] }, 100, 8_000, "TYPE /subagents-fleet", 1).map(stripAnsi);
const safe = badge({ workflow: true, state: "running", startedAt: 0, workflowChildren: [{ agent: "subagent", state: "unknown", summary: "Workflow task" }] }, 100, 8_000, "", 0).map(stripAnsi);

[single("running"), single("running"), workflow, workflow, safe, single("done")].forEach((lines, index) => frame(index, lines));
console.log(`wrote ${6} SVG frames to ${outputDir}`);
