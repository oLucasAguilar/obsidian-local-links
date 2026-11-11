# Local Links

**Links to files outside the vault open the file, not an empty note.**

```md
[Study](~/Projects/app/tmp/study.html)
[Report](/home/me/Downloads/report.pdf)
[Page](file:///home/me/site/index.html#intro)
file:///home/me/site/index.html
```

Without the plugin, clicking `[Study](~/...)` makes Obsidian create `~/Projects/app/tmp/` inside your vault and open an empty `study.html` note. With it:

- `.html` opens in the browser you choose, as a `file://` URL, `#fragment` kept
- any other file or folder opens with the system default app
- a path that does not exist shows a notice and creates nothing
- works in Live Preview and Reading view

Desktop only. Linux is the tested platform.

## Install

Not in the community list yet. Copy `main.js` and `manifest.json` to `<vault>/.obsidian/plugins/local-links/`, then enable **Local Links** in Settings → Community plugins.

## Settings

- **Browser command**, default `brave-browser`. Arguments split on spaces, e.g. `brave-browser --incognito`. Empty: the system default app.
- **Browser extensions**, default `html, htm`.

## Paths with spaces

Markdown ends a link at the first space, so write `[a](<~/my folder/a.html>)` or `~/my%20folder/a.html`.

## Limits

[docs/limits.md](docs/limits.md). What exists already and why this is a separate plugin: [docs/alternatives.md](docs/alternatives.md).

## Development

- `node test/test.js`: parsing and open rules, plain node
- `dev/e2e.sh`: clicks real links in a throwaway Obsidian over CDP (needs Node 20+ and `playwright-core` from the npx cache). A window opens for a few seconds; your vault is not touched. The last check turns the plugin off and confirms the empty note comes back, so a passing run is not a test that cannot fail.
