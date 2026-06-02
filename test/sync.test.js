import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createContext, ensureSourceFile, runSync } from "../src/lib/sync.js";

test("ensureSourceFile creates a default source", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-root-cli-"));
  process.env.AGENTSYNC_HOME = tempDir;
  process.env.CODEX_HOME = path.join(tempDir, ".codex-test");
  process.env.CLAUDE_HOME = path.join(tempDir, ".claude-test");

  const context = createContext({});
  const created = await ensureSourceFile(context, { force: false });
  const content = await fs.readFile(context.paths.source, "utf8");

  assert.equal(created, true);
  assert.match(content, /# AGENTS/);
});

test("runSync links Codex and Claude targets and reports manual Cursor step", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-root-cli-"));
  process.env.AGENTSYNC_HOME = tempDir;
  process.env.CODEX_HOME = path.join(tempDir, ".codex-test");
  process.env.CLAUDE_HOME = path.join(tempDir, ".claude-test");

  const context = createContext({});
  await fs.mkdir(path.dirname(context.paths.source), { recursive: true });
  await fs.writeFile(context.paths.source, "# AGENTS\n\n- hello\n", "utf8");

  const results = await runSync(context, {
    dryRun: false,
    json: false,
  });

  const codexStats = await fs.lstat(context.paths.codexTarget);
  const claudeStats = await fs.lstat(context.paths.claudeTarget);
  const codexLink = await fs.readlink(context.paths.codexTarget);
  const claudeLink = await fs.readlink(context.paths.claudeTarget);
  const cursorResult = results.find((result) => result.label === "cursor");

  assert.equal(results[0].label, "codex");
  assert.equal(codexStats.isSymbolicLink(), true);
  assert.equal(claudeStats.isSymbolicLink(), true);
  assert.equal(path.resolve(path.dirname(context.paths.codexTarget), codexLink), path.resolve(context.paths.source));
  assert.equal(path.resolve(path.dirname(context.paths.claudeTarget), claudeLink), path.resolve(context.paths.source));
  assert.equal(cursorResult?.status, "manual");
  assert.equal(cursorResult?.path, context.paths.source);
  assert.match(cursorResult?.details || "", new RegExp(`@${context.paths.source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("runSync replaces existing files with symlinks", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-root-cli-"));
  process.env.AGENTSYNC_HOME = tempDir;
  process.env.CODEX_HOME = path.join(tempDir, ".codex-test");
  process.env.CLAUDE_HOME = path.join(tempDir, ".claude-test");

  const context = createContext({});
  await fs.mkdir(path.dirname(context.paths.source), { recursive: true });
  await fs.writeFile(context.paths.source, "# AGENTS\n\n- replaced\n", "utf8");

  await fs.mkdir(path.dirname(context.paths.codexTarget), { recursive: true });
  await fs.mkdir(path.dirname(context.paths.claudeTarget), { recursive: true });
  await fs.writeFile(context.paths.codexTarget, "legacy codex file", "utf8");
  await fs.writeFile(context.paths.claudeTarget, "legacy claude file", "utf8");

  const results = await runSync(context, { dryRun: false, json: false });

  const codexStats = await fs.lstat(context.paths.codexTarget);
  const claudeStats = await fs.lstat(context.paths.claudeTarget);
  const codexLink = await fs.readlink(context.paths.codexTarget);
  const claudeLink = await fs.readlink(context.paths.claudeTarget);
  const codexResult = results.find((result) => result.label === "codex");
  const claudeResult = results.find((result) => result.label === "claude");

  assert.equal(codexStats.isSymbolicLink(), true);
  assert.equal(claudeStats.isSymbolicLink(), true);
  assert.equal(path.resolve(path.dirname(context.paths.codexTarget), codexLink), path.resolve(context.paths.source));
  assert.equal(path.resolve(path.dirname(context.paths.claudeTarget), claudeLink), path.resolve(context.paths.source));
  assert.equal(codexResult?.status, "updated");
  assert.equal(claudeResult?.status, "updated");
});

test("runSync is idempotent when symlinks already match source", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-root-cli-"));
  process.env.AGENTSYNC_HOME = tempDir;
  process.env.CODEX_HOME = path.join(tempDir, ".codex-test");
  process.env.CLAUDE_HOME = path.join(tempDir, ".claude-test");

  const context = createContext({});
  await fs.mkdir(path.dirname(context.paths.source), { recursive: true });
  await fs.writeFile(context.paths.source, "# AGENTS\n\n- stable\n", "utf8");

  await runSync(context, { dryRun: false, json: false });
  const secondRun = await runSync(context, { dryRun: false, json: false });

  const codexResult = secondRun.find((result) => result.label === "codex");
  const claudeResult = secondRun.find((result) => result.label === "claude");

  assert.equal(codexResult?.status, "unchanged");
  assert.equal(claudeResult?.status, "unchanged");
});
