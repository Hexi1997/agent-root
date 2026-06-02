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

  return {
    home,
    paths: {
      source,
      codexTarget: path.join(codexHome, "AGENTS.md"),
      claudeTarget: path.join(claudeHome, "CLAUDE.md"),
    },
  };
}

export function parseArgs(args) {
  const options = {
    command: "link",
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

  if (!["link", "init"].includes(options.command)) {
    throw new Error(`Unknown command: ${options.command}`);
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
  const results = [];

  results.push(
    await ensureManagedSymlink({
      dryRun: options.dryRun,
      label: "codex",
      targetPath: context.paths.codexTarget,
      sourcePath: context.paths.source,
      description: "Link Codex home AGENTS.md to the single source file",
    }),
  );

  results.push(
    await ensureManagedSymlink({
      dryRun: options.dryRun,
      label: "claude",
      targetPath: context.paths.claudeTarget,
      sourcePath: context.paths.source,
      description: "Link Claude home CLAUDE.md to the single source file",
    }),
  );

  results.push(
    buildCursorManualStep(context.paths.source),
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

async function ensureManagedSymlink({ dryRun, label, targetPath, sourcePath, description }) {
  const expected = path.resolve(sourcePath);
  const currentState = await inspectPath(targetPath, expected);
  if (currentState.kind === "directory") {
    throw new Error(`Refusing to replace directory with symlink: ${targetPath}`);
  }
  const needsUpdate = !currentState.exists || !currentState.matches;
  const status = !currentState.exists ? "created" : currentState.matches ? "unchanged" : "updated";

  if (!dryRun && needsUpdate) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.rm(targetPath, { force: true });
    await fs.symlink(sourcePath, targetPath);
  }

  return {
    label,
    status: dryRun ? "planned" : status,
    path: targetPath,
    details: `${description} (${targetPath} -> ${sourcePath})`,
  };
}

function buildCursorManualStep(sourcePath) {
  return {
    label: "cursor",
    status: "manual",
    path: sourcePath,
    details: `Create a Cursor user rule manually and set it to @${sourcePath}`,
  };
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

async function inspectPath(targetPath, expectedResolvedPath) {
  try {
    const stats = await fs.lstat(targetPath);
    if (stats.isDirectory()) {
      return { exists: true, matches: false, kind: "directory" };
    }
    if (!stats.isSymbolicLink()) {
      return { exists: true, matches: false, kind: "file" };
    }

    const linkTarget = await fs.readlink(targetPath);
    const resolvedTarget = path.resolve(path.dirname(targetPath), linkTarget);
    return { exists: true, matches: resolvedTarget === expectedResolvedPath, kind: "symlink" };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { exists: false, matches: false, kind: "missing" };
    }
    throw error;
  }
}
