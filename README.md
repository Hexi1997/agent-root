# agent-root

`agent-root` is a small CLI for people who want one source of truth for agent instructions and a thin compatibility layer for multiple coding clients.

The default model is:

- single source: `~/AGENTS.md`
- Codex target: `~/.codex/AGENTS.md`
- Claude target: `~/.claude/CLAUDE.md`
- Cursor strategy: rely on Cursor's automatic import of external tool configs, while documenting the setup in `~/.cursor/AGENTS.md`

## Why this exists

There is no shared cross-client standard for home-directory prompt constraint files across Codex, Claude Code, and Cursor.

What does exist today:

- Codex has a documented `AGENTS.md` mechanism.
- Claude Code uses `CLAUDE.md`, and can import `AGENTS.md`.
- Cursor can import configs from other tools, but does not document a stable home-directory markdown file for global rules.

`agent-root` treats this as an adapter problem instead of waiting for a universal standard.

## Install

```bash
npm install
npm link
```

## Usage

Create the single source file if it does not exist:

```bash
agent-root init
```

Sync all targets:

```bash
agent-root sync
```

Preview changes without writing:

```bash
agent-root sync --dry-run
```

Use a custom source:

```bash
agent-root sync --source ~/company/AGENTS.md
```

Machine-readable output:

```bash
agent-root sync --json
```

## What gets written

### Codex

`agent-root` mirrors the source content into:

```text
~/.codex/AGENTS.md
```

### Claude

`agent-root` writes a managed shim:

```md
@/Users/you/AGENTS.md
```

to:

```text
~/.claude/CLAUDE.md
```

This keeps Claude on the same source without duplicating content.

### Cursor

Today, the stable path is `import-only` mode:

- sync Codex and Claude home files
- keep Cursor's "Automatically import agent configs from other tools" enabled
- write a reference file to `~/.cursor/AGENTS.md`

This is intentionally conservative because Cursor's global rule persistence format is not documented and may change.

There is also an experimental `--cursor-mode db`, but it currently only validates that the expected Cursor state database exists. It does not mutate Cursor's internal storage yet.

## Environment overrides

These are mainly useful for testing:

- `AGENTSYNC_HOME`
- `CODEX_HOME`
- `CLAUDE_HOME`
- `CURSOR_DATA_DIR`

## Roadmap

- add a real Cursor global-rule adapter once the persistence format is stable enough to target
- add Windows and Linux-specific path presets for Cursor data directories
- add managed block mode for teams that want to preserve custom content around generated shims

## License

MIT
