# Limits

Checked on 2026-11-11, Obsidian 1.15.0 (snap, Linux; version read from the user agent in the e2e), by `test/test.js` and `dev/e2e.sh`.

## Not covered by the tests

- **The real browser launch.** The e2e swaps the browser command for a script that logs its arguments. That proves Obsidian spawns the command with the right URL, not that the browser opens it.
- **The system default app** (`.pdf`, `.md`, folders). It goes through Electron's `shell.openPath`, which would open a real window, so the e2e does not click those.
- **The notice on screen.** In the throwaway Obsidian a `Notice` never reached the DOM, not even when created directly, so the e2e checks that the plugin asked for one.
- macOS and Windows. Windows paths (`C:\...`) are not recognised at all.

## Behaviour to know

- `/x` is also Obsidian's syntax for a link from the vault root. An absolute path is taken only when the vault cannot resolve it and it exists on disk or sits under your home folder. `[a](/Daily/new)` still creates that note, as Obsidian always did.
- `~/x` always wins, even over a vault folder literally named `~`.
- `~otheruser/x` is not expanded.
- A link to a missing file under `~` or your home folder shows a notice. Obsidian still draws it as an unresolved link (faded), before and after the click.
- A `#` in a path counts as a fragment only when the part before it is what exists on disk.
- A bare `file:///` in Reading view is linked by the plugin, up to the first space, quote, `<`, `>`, `)` or `]`. A trailing period would be part of the URL.
- Paths inside backticks are code, not links, and stay unclickable.
- The browser command is split on spaces: a binary path with spaces needs a wrapper script.
