# Alternatives

Searched on 2026-11-11: the official community plugin list (`obsidianmd/obsidian-releases`, `community-plugins.json`, 10,242 plugins, filtered for local/external file links, `file://`, outside vault, tilde, absolute path) and a web search. Read the READMEs of the closest ones.

The need: a normal Markdown link with a label, `[Study](~/path/file.html)`, that opens the HTML in a chosen browser.

| plugin | close because | why it does not fit |
|---|---|---|
| Marco Polo (`crufi/obsidian-marco-polo`) | expands `~`, opens the file | path in backticks, not a link with a label; system default app |
| Fast External Embed (`imandyrrr/obsidian-fast-external-embed`) | absolute paths and `file:///`, no empty note | wiki links (`[[/abs/path]]`), no `~`; system default app |
| External File Embed and Link (`oylbin/obsidian-external-file-embed-and-link`) | links outside the vault | own `home://` scheme; system default app |
| External Namespaces (`jncohen/obsidian-external-namespaces`) | links outside the vault | `obsidian://ens?p=prefix:path` URLs; system default app |
| File path to URI (`michalbures/obsidian-file-path-to-uri`) | turns a path into `file://` | inserts the link, does not change how it opens |
| Open Link With (`mamoruds/obsidian-open-link-with`) | picks the browser | `http(s)` links only |

"System default app" matters because on the machine this was written for, `text/html` defaults to another browser than the one wanted, and changing that default affects every app.
