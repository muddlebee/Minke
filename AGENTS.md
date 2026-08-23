# Oru Repository Guide

## Product Direction

- Oru is a harness-neutral Electron desktop shell for coding agents.
- Keep the UI dependent on the `AgentRuntime` contract in
  `desktop/renderer/agent-runtime.ts`, not on a specific agent harness.
- Add Pi, Hermes, and other integrations as adapters behind that contract.
- Do not restore DeepSeek Harness startup, staging, or packaging unless a task
  explicitly asks for it. The vendored implementation is legacy reference code.
- Use **Oru** for active product copy and packaging. Existing `@minke/*` import
  aliases and repository URLs are internal compatibility names; do not rename
  them as part of unrelated changes.

## Architecture Boundaries

- `desktop/main/` is the trusted Electron host for OS, filesystem, terminal,
  window, and navigation capabilities.
- `desktop/preload/desktop-preload.ts` exposes the smallest practical bridge.
  Validate data crossing IPC in both directions and keep Node/Electron APIs out
  of the renderer.
- `desktop/renderer/` owns presentation and interaction state. Keep components
  usable with the demo runtime and an injected production runtime.
- Treat approved workspace roots as capabilities. Resolve canonical paths and
  reject sibling and symlink escapes before filesystem access.
- Keep embedded web content isolated, credential-free, and limited to validated
  HTTP(S) navigation. Open external destinations through the trusted host.
- Route user-facing strings through `desktop/i18n.ts` and preserve English and
  Chinese dictionary parity.

## Implementation Practices

- Use strict TypeScript and shared contracts instead of duplicating IPC shapes.
- Follow Vercel React best practices: derive state during render where possible,
  keep effect dependencies stable, clean up subscriptions and native resources,
  and lazy-load heavy tool surfaces.
- Preserve workspace-, session-, and tool-local state across ordinary panel or
  tab visibility changes. Dispose native resources only when their owning scope
  is removed.
- Keep changes focused. Do not edit `vendor/deepseek-harness/` or generated
  build output unless the task explicitly requires it.

## Verification

- Install and run dependencies with `pnpm`.
- Run `pnpm verify` for desktop or renderer changes. It includes type checking,
  Node contract tests, and Playwright tests against the real Electron app.
- Run `pnpm package` for Electron main/preload, native dependency, packaging,
  branding, or release changes.
- Add a focused regression test for behavior fixes. Prefer Node tests for pure
  contracts and Electron Playwright tests for interaction, focus, IPC, webview,
  terminal, and lifecycle behavior.
- Before committing, run `git diff --check` and confirm no generated artifacts
  or unrelated files are staged.
