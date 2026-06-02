import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createContext, ensureSourceFile, runSync } from "../src/lib/sync.js";

test("ensureSourceFile creates a default source", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-root-"));
  process.env.AGENTSYNC_HOME = tempDir;
  process.env.CODEX_HOME = path.join(tempDir, ".codex-test");
  process.env.CLAUDE_HOME = path.join(tempDir, ".claude-test");
  process.env.CURSOR_DATA_DIR = path.join(tempDir, "Cursor");

  const context = createContext({});
  const created = await ensureSourceFile(context, { force: false });
  const content = await fs.readFile(context.paths.source, "utf8");

  assert.equal(created, true);
  assert.match(content, /# AGENTS/);
});

test("runSync writes Codex and Claude targets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-root-"));
  process.env.AGENTSYNC_HOME = tempDir;
  process.env.CODEX_HOME = path.join(tempDir, ".codex-test");
  process.env.CLAUDE_HOME = path.join(tempDir, ".claude-test");
  process.env.CURSOR_DATA_DIR = path.join(tempDir, "Cursor");

  const context = createContext({});
  await fs.mkdir(path.dirname(context.paths.source), { recursive: true });
  await fs.writeFile(context.paths.source, "# AGENTS\n\n- hello\n", "utf8");

  const results = await runSync(context, {
    dryRun: false,
    cursorMode: "import-only",
    json: false,
  });

  const codex = await fs.readFile(context.paths.codexTarget, "utf8");
  const claude = await fs.readFile(context.paths.claudeTarget, "utf8");
  const cursorHint = await fs.readFile(context.paths.cursorHintFile, "utf8");

  assert.equal(results[0].label, "codex");
  assert.equal(codex, "# AGENTS\n\n- hello\n");
  assert.match(claude, new RegExp(context.paths.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(cursorHint, /Automatically import agent configs from other tools/);
});
