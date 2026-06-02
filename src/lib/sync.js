import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const DEFAULT_SOURCE_TEMPLATE = `# AGENTS

## Communication
- Be concise.
- Explain important tradeoffs before making risky changes.

## Engineering
- Prefer small, reviewable diffs.
- Run relevant checks before finalizing changes.
`;

export function createContext(options = {}) {
  const home = process.env.AGENTSYNC_HOME || os.homedir();
  const source = expandHome(options.source || path.join(home, "AGENTS.md"), home);
  const codexHome = expandHome(process.env.CODEX_HOME || path.join(home, ".codex"), home);
  const claudeHome = expandHome(process.env.CLAUDE_HOME || path.join(home, ".claude"), home);
  const cursorDataDir = expandHome(
    process.env.CURSOR_DATA_DIR ||
      path.join(home, "Library", "Application Support", "Cursor"),
    home,
  );

  return {
    home,
    paths: {
      source,
      codexTarget: path.join(codexHome, "AGENTS.md"),
      claudeTarget: path.join(claudeHome, "CLAUDE.md"),
      cursorHintFile: path.join(home, ".cursor", "AGENTS.md"),
      cursorStorageDb: path.join(cursorDataDir, "User", "globalStorage", "state.vscdb"),
    },
  };
}

export function parseArgs(args) {
  const options = {
    command: "sync",
    cursorMode: "import-only",
    dryRun: false,
    force: false,
    help: false,
    json: false,
  };

  const queue = [...args];
  if (queue[0] && !queue[0].startsWith("-")) {
    options.command = queue.shift();
  }

  while (queue.length > 0) {
    const arg = queue.shift();
    switch (arg) {
      case "--source":
        options.source = queue.shift();
        break;
      case "--cursor-mode":
        options.cursorMode = queue.shift() || "import-only";
        break;
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--force":
        options.force = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--json":
        options.json = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!["sync", "init"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
  }

  if (!["import-only", "db"].includes(options.cursorMode)) {
    throw new Error(`Unsupported cursor mode: ${options.cursorMode}`);
  }

  return options;
}

export async function ensureSourceFile(context, { force }) {
  const exists = await fileExists(context.paths.source);
  if (exists && !force) {
    return false;
  }

  await fs.mkdir(path.dirname(context.paths.source), { recursive: true });
  if (!exists) {
    await fs.writeFile(context.paths.source, DEFAULT_SOURCE_TEMPLATE, "utf8");
    return true;
  }

  return false;
}

export async function runSync(context, options) {
  const sourceContent = await fs.readFile(context.paths.source, "utf8");
  const results = [];

  results.push(
    await writeManagedFile({
      dryRun: options.dryRun,
      label: "codex",
      path: context.paths.codexTarget,
      content: sourceContent,
      description: "Mirror source content into Codex home AGENTS.md",
    }),
  );

  results.push(
    await writeManagedFile({
      dryRun: options.dryRun,
      label: "claude",
      path: context.paths.claudeTarget,
      content: renderClaudeShim(context.paths.source),
      description: "Point Claude home CLAUDE.md at the single AGENTS source",
    }),
  );

  results.push(
    await syncCursor({
      context,
      dryRun: options.dryRun,
      mode: options.cursorMode,
      sourceContent,
    }),
  );

  if (options.json) {
    return JSON.stringify(
      results.map((result) => ({
        label: result.label,
        status: result.status,
        path: result.path,
        details: result.details,
      })),
      null,
      2,
    );
  }

  return results;
}

export function summarizeResults(results) {
  if (typeof results === "string") {
    return results;
  }

  return results
    .map((result) => {
      const prefix = `${result.label}: ${result.status}`;
      const suffix = result.details ? ` (${result.details})` : "";
      return `${prefix} -> ${result.path}${suffix}`;
    })
    .join("\n");
}

async function syncCursor({ context, dryRun, mode, sourceContent }) {
  if (mode === "db") {
    const dbExists = await fileExists(context.paths.cursorStorageDb);
    return {
      label: "cursor",
      status: dryRun ? "planned" : dbExists ? "skipped" : "missing",
      path: context.paths.cursorStorageDb,
      details: dbExists
        ? "experimental db mode is not implemented yet; import-only mode remains the stable path"
        : "Cursor state database was not found",
    };
  }

  const hintContent = renderCursorHint(sourceContent, context.paths);
  return writeManagedFile({
    dryRun,
    label: "cursor",
    path: context.paths.cursorHintFile,
    content: hintContent,
    description:
      "Create a human-readable Cursor hint file while relying on imported Codex/Claude home configs",
    details:
      "Cursor should ingest the synced Codex/Claude home files when automatic external config import is enabled",
  });
}

async function writeManagedFile({ dryRun, label, path: targetPath, content, description, details }) {
  const exists = await fileExists(targetPath);
  const current = exists ? await fs.readFile(targetPath, "utf8") : null;
  const status = !exists ? "created" : current === content ? "unchanged" : "updated";

  if (!dryRun && current !== content) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");
  }

  return {
    label,
    status: dryRun ? "planned" : status,
    path: targetPath,
    details: details || description,
  };
}

function renderClaudeShim(sourcePath) {
  return `# Managed by agent-root
# Edit the single source file instead:
# ${sourcePath}

@${sourcePath}
`;
}

function renderCursorHint(sourceContent, paths) {
  return `# Managed by agent-root

This file documents the single-source setup for Cursor.

- Source: ${paths.source}
- Codex mirror: ${paths.codexTarget}
- Claude shim: ${paths.claudeTarget}

Cursor does not currently expose a documented home-directory markdown rule file.
The stable strategy is:

1. Keep Cursor's "Automatically import agent configs from other tools" enabled.
2. Let Cursor import the synced Codex and Claude home files.
3. Treat this file as a local audit trail and fallback reference.

## Source Preview

${sourceContent}
`;
}

function expandHome(inputPath, home) {
  if (!inputPath.startsWith("~")) {
    return inputPath;
  }

  if (inputPath === "~") {
    return home;
  }

  return path.join(home, inputPath.slice(2));
}

async function fileExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
