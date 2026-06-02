# agent-root-cli

`agent-root-cli` is a small CLI for people who want one source of truth for agent instructions and a thin compatibility layer for multiple coding clients.

## Platform support

- Supported: macOS, Linux
- Not supported: Windows

The default model is:

- single source: `~/AGENTS.md`
- Codex target: `~/.codex/AGENTS.md`
- Claude target: `~/.claude/CLAUDE.md`
- Cursor strategy: create a Cursor user rule manually and point it to `@~/AGENTS.md`

## Why this exists

There is no shared cross-client standard for home-directory prompt constraint files across Codex, Claude Code, and Cursor.

What does exist today:

- Codex has a documented `AGENTS.md` mechanism.
- Claude Code uses `CLAUDE.md`, and can import `AGENTS.md`.
- Cursor supports user rules, and those rules can reference an external `AGENTS.md` via `@`.

`agent-root-cli` treats this as an adapter problem instead of waiting for a universal standard.

## Install

```bash
npm install -g agent-root-cli
```

Or run it without a global install:

```bash
npx agent-root-cli link
```

## Usage

Create the single source file if it does not exist:

```bash
agent-root-cli init
```

Link all targets:

```bash
agent-root-cli link
```

Preview changes without writing:

```bash
agent-root-cli link --dry-run
```

Use a custom source:

```bash
agent-root-cli link --source ~/company/AGENTS.md
```

Machine-readable output:

```bash
agent-root-cli link --json
```

## What gets linked

### Codex

`agent-root-cli` creates a symlink:

```text
~/.codex/AGENTS.md -> ~/AGENTS.md
```

### Claude

`agent-root-cli` creates a symlink:

```text
~/.claude/CLAUDE.md -> ~/AGENTS.md
```

This keeps Codex and Claude on the same source without duplicated files.

### Cursor

`agent-root-cli` no longer writes any Cursor-specific files.

Create a Cursor user rule manually and set it to:

```md
@~/AGENTS.md
```

In practice, use your actual source path (default: `~/AGENTS.md`).

## Quick updates via an agent skill

Once `init` and `link` have been run, you can update your instructions in natural
language instead of editing files by hand, using the `update-user-memory` skill for
Claude Code (and other agents that support the [skills](https://github.com/vercel-labs/skills) format).

Install it:

```bash
pnpx skills add Hexi1997/skills --skill=update-user-memory -g
```

Then just ask your agent, for example:

> Remember globally: replies should be concise

The skill verifies the link is set up, picks the right section in your single source
file, shows you the change for confirmation, and writes it. Because the targets are
symlinks, the update is live across Codex and Claude immediately (and Cursor via its
`@` user rule) — no extra command needed.

## Environment overrides

These are mainly useful for testing:

- `AGENTSYNC_HOME`
- `CODEX_HOME`
- `CLAUDE_HOME`

## Roadmap

- add managed block mode for teams that want to preserve custom content around generated links

## License

MIT
