#!/usr/bin/env node

import os from "node:os";
import process from "node:process";
import {
  ensureSourceFile,
  runSync,
  summarizeResults,
  parseArgs,
  createContext,
} from "./lib/sync.js";

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = createContext(options);

  if (options.help) {
    printHelp(context.paths.source);
    return;
  }

  if (options.command === "init") {
    const created = await ensureSourceFile(context, { force: options.force });
    process.stdout.write(
      `${created ? "Created" : "Already exists"} source file at ${context.paths.source}\n`,
    );
    return;
  }

  const ensured = await ensureSourceFile(context, { force: false });
  if (ensured) {
    process.stdout.write(`Created source file at ${context.paths.source}\n`);
  }

  const results = await runSync(context, options);
  process.stdout.write(`${summarizeResults(results)}\n`);
}

function printHelp(defaultSourcePath) {
  process.stdout.write(`agent-root-cli

Usage:
  agent-root-cli link [options]
  agent-root-cli init [options]
  agent-root-cli --help

Commands:
  link              Link the source AGENTS file into supported targets.
  init              Create the source file if it does not already exist.

Options:
  --source <path>   Override the source file path.
  --dry-run         Print planned writes without changing files.
  --force           Overwrite managed targets even if source was just created.
  --json            Output machine-readable JSON.
  --help            Show this help text.

Defaults:
  source: ${defaultSourcePath}

Notes:
  - Codex target is a symlink: ~/.codex/AGENTS.md -> <source-path>.
  - Claude target is a symlink: ~/.claude/CLAUDE.md -> <source-path>.
  - Cursor is manual-only: create a user rule in Cursor and point it to
    @<source-path> (for example @${defaultSourcePath}).
`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
