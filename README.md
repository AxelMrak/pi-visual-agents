# pi-visual-agents

A small Pi Coding Agent extension that makes delegated work easier to scan without exposing prompts or secrets.

It adds IBM-90s-inspired status badges for subagents, safe activity labels, animated running indicators, and inline workflow child rows.

## Features

- Role-aware badges for researchers, reviewers, scouts, workers, oracles, and delegates.
- Accessible text status labels: `QUEUED`, `RUNNING`, `DONE`, `ERROR`, and `CANCELLED`.
- A four-frame running spinner that redraws without mutating the transcript.
- Safe activity details for common tools such as `read`, `write`, `edit`, and restricted `bash` commands.
- Workflow child rows read only from the verified `workflowChildren.children` status schema.
- Child summaries are derived from validated child IDs; prompts, task text, titles, session names, and private fields are never rendered.
- Unknown child states remain `UNKNOWN` instead of being guessed as active.
- Short retention for finished badges so the UI does not accumulate stale rows.
- A `TYPE /subagents-fleet` hint points to the native `pi-subagents` inspector when multiple runs are visible.

This extension does **not** implement the FleetView inspector or register its keyboard shortcut. Install `pi-subagents` for the native inspector and its `Ctrl+Alt+O` shortcut.

## Requirements

- Pi Coding Agent with extension support.
- `pi-subagents` is optional for the badges, but required for the native FleetView and `/subagents-fleet` command.

## Install from GitHub

```bash
pi install git:github.com/AxelMrak/pi-visual-agents
```

For a reproducible installation, pin a release tag or commit:

```bash
pi install git:github.com/AxelMrak/pi-visual-agents@v0.1.0
```

## Try locally

```bash
pi install /Users/axelmrak/.pi/agent/extensions/pi-visual-agents
```

Restart Pi after installation or package updates so the extension module is loaded from the new package.

## Use cases

### Scan one delegated run

A single active run shows its role, state, elapsed time, and a safe activity label:

```text
⟦ ⌕ RESEARCHER ⟧  ◐ RUNNING · 00:00
Read render.js
```

Captured from the renderer sandbox: [`demo/single-run.txt`](demo/single-run.txt).

### Monitor a workflow

Workflow children appear beneath the parent with their own role and terminal state. The native FleetView entry point is shown as typing guidance:

```text
⟦ • WORKFLOW ⟧  ◓ RUNNING · 00:00                                              TYPE /subagents-fleet
  ✓ REVIEWER · ◓ RUNNING — Review visual agent safety
  ⌁ WORKER · ✓ DONE — Worker step
  ⌖ SCOUT · ! ERROR — Scout step
```

Captured from the renderer sandbox: [`demo/workflow-children.txt`](demo/workflow-children.txt).

### Handle incomplete status safely

Malformed or unfamiliar child states stay explicit instead of being guessed as active:

```text
⟦ • WORKFLOW ⟧  ◐ RUNNING · 00:00
  • SUBAGENT · ? UNKNOWN — Workflow task
```

Captured from the renderer sandbox: [`demo/safe-unknown.txt`](demo/safe-unknown.txt).

Regenerate the captures with:

```bash
node demo/capture.mjs
```

## Development

```bash
bun render.test.js
bun lifecycle.test.js
npm run check
npm run pack:check
```

The focused tests cover rendering, lifecycle transitions, workflow child schema validation, width-safe truncation, and prompt/tool-detail sanitization. The capture script runs only local fixtures and does not start Pi, call agents, or access external services.

## Privacy and safety

The renderer intentionally avoids displaying task prompts, session names, titles, arbitrary command text, file contents, or secret-like paths. Unknown or malformed values fall back to generic labels. The extension reads local Pi status artifacts to display progress; it does not make network requests or send telemetry.

## License

MIT
