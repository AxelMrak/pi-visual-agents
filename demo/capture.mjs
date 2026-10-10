import fs from "node:fs";
import { badge } from "../render.js";

const stripAnsi = value => value.replace(/\x1b\[[0-9;]*m/g, "");
const capture = (name, lines) => fs.writeFileSync(new URL(`./${name}.txt`, import.meta.url), `${lines.join("\n")}\n`);

capture("single-run", badge({ role: "researcher", state: "running", startedAt: 0, activity: "Read render.js" }, 80, 12_000, "", 0).map(stripAnsi));
capture("workflow-children", badge({
  workflow: true,
  state: "running",
  startedAt: 0,
  workflowChildren: [
    { agent: "reviewer", state: "running", summary: "Review visual agent safety" },
    { agent: "worker", state: "done", summary: "Worker step" },
    { agent: "scout", state: "error", summary: "Scout step" },
  ],
}, 100, 12_000, "TYPE /subagents-fleet", 1).map(stripAnsi));
capture("safe-unknown", badge({
  workflow: true,
  state: "running",
  startedAt: 0,
  workflowChildren: [
    { agent: "subagent", state: "unknown", summary: "Workflow task" },
  ],
}, 80, 12_000, "", 0).map(stripAnsi));
