// Clicks real links in a throwaway Obsidian (own profile and vault) and checks what opened.
// The browser command is swapped for a script that logs its arguments, so no browser opens.
// Run: dev/e2e.sh
const fs = require('fs'), path = require('path');
const { open, sleep } = require('./obsidian-demo.cjs');

const id = 'local-links';
const pluginDir = path.join(__dirname, '..');

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     ${detail}`}`); };

(async () => {
  const notes = {
    'Links.md': 'x\n',
    'Other.md': '# Other\n',
  };
  const demo = await open({ id, pluginDir, files: ['main.js', 'manifest.json'], notes, openNote: 'Links', port: 9351, width: 900, height: 600 });
  try {
    // files outside the vault, inside the snap's reach
    const site = path.join(demo.root, 'site');
    fs.mkdirSync(site, { recursive: true });
    fs.writeFileSync(path.join(site, 'page.html'), '<h1 id="sec">page</h1>');
    fs.writeFileSync(path.join(site, 'a b.html'), '<h1>spaces</h1>');
    const log = path.join(demo.root, 'opened.log');
    const logger = path.join(demo.root, 'logger.sh');
    fs.writeFileSync(logger, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${log}'\n`, { mode: 0o755 });

    const home = require('os').homedir();
    const rel = path.relative(home, site);
    const links = [
      ['tilde', `[Tilde](~/${rel}/page.html#sec)`, `file://${site}/page.html#sec`],
      ['absolute', `[Abs](${site}/page.html)`, `file://${site}/page.html`],
      ['file-url', `[File](file://${site}/page.html)`, `file://${site}/page.html`],
      ['bare file-url', `file://${site}/page.html#bare`, `file://${site}/page.html#bare`],
      ['spaces', `[Spaces](<~/${rel}/a b.html>)`, `file://${site}/a%20b.html`],
    ];
    const body = links.map(([, md]) => `- ${md}`).join('\n')
      + `\n- [Missing](~/${rel}/nope.html)\n- [Vault](/Other)\n`;
    await demo.js(async ({ body, logger }) => {
      const p = app.plugins.plugins['local-links'];
      p.settings.browserCommand = logger; p.settings.browserExtensions = 'html';
      await app.vault.modify(app.vault.getAbstractFileByPath('Links.md'), body);
    }, { body, logger });
    await sleep(600);
    console.log('obsidian:', await demo.js(() => navigator.userAgent.match(/obsidian\/[\d.]+/i)?.[0]));
    const vaultBefore = await demo.js(() => app.vault.getAllLoadedFiles().map(f => f.path).sort());

    const linkText = { tilde: 'Tilde', absolute: 'Abs', 'file-url': 'File', 'bare file-url': 'page.html#bare', spaces: 'Spaces' };

    for (const mode of ['source', 'preview']) {
      await demo.js(async mode => {
        const leaf = app.workspace.getLeavesOfType('markdown')[0];
        await leaf.setViewState({ type: 'markdown', state: { file: 'Links.md', mode, source: false } });
        app.workspace.setActiveLeaf(leaf, { focus: true });
        if (mode === 'source') { const e = leaf.view.editor; e.setCursor(0, 0); }
      }, mode);
      await sleep(700);
      const label = mode === 'source' ? 'live preview' : 'reading';
      const root = mode === 'source' ? '.markdown-source-view .cm-content' : '.markdown-reading-view';

      for (const [name, , expected] of links) {
        fs.rmSync(log, { force: true });
        const box = await demo.js(({ root, text }) => {
          const els = [...document.querySelectorAll(`${root} a, ${root} .cm-underline, ${root} .cm-url, ${root} .cm-link`)];
          const el = els.find(e => e.textContent.trim() === text) || els.find(e => e.textContent.includes(text));
          if (!el) return null;
          const r = el.getBoundingClientRect(); return { x: r.left + Math.min(8, r.width / 2), y: r.top + r.height / 2 };
        }, { root, text: linkText[name] });
        if (!box) { check(`${label}: ${name} link is rendered`, false, 'element not found'); continue; }
        await demo.page.mouse.click(box.x, box.y);
        await sleep(900);
        const got = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim() : '(nothing opened)';
        check(`${label}: ${name} opens in the browser command`, got === expected, `got ${got}\n     expected ${expected}`);
        await demo.js(() => { const l = app.workspace.getLeavesOfType('markdown')[0]; app.workspace.setActiveLeaf(l, { focus: true }); });
      }

      // missing file: a notice, no note
      fs.rmSync(log, { force: true });
      await demo.js(() => { const p = app.plugins.plugins['local-links']; p._notes = []; p.notify = m => p._notes.push(m); });
      const miss = await demo.js(({ root }) => { const el = [...document.querySelectorAll(`${root} a, ${root} .cm-underline, ${root} .cm-link`)].find(e => e.textContent.trim() === 'Missing');
        const r = el.getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }; }, { root });
      await demo.page.mouse.click(miss.x, miss.y);
      await sleep(700);
      const notice = await demo.js(() => app.plugins.plugins['local-links']._notes.join(' | '));
      check(`${label}: missing file shows a notice`, notice.includes('não existe'), `notice: "${notice}"`);
      check(`${label}: missing file opens nothing`, !fs.existsSync(log));

      // vault-root link still opens the note
      const vbox = await demo.js(({ root }) => { const el = [...document.querySelectorAll(`${root} a, ${root} .cm-underline, ${root} .cm-link`)].find(e => e.textContent.trim() === 'Vault');
        const r = el.getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }; }, { root });
      await demo.page.mouse.click(vbox.x, vbox.y);
      await sleep(700);
      const active = await demo.js(() => app.workspace.getActiveFile()?.path);
      check(`${label}: /Other still opens the vault note`, active === 'Other.md', `active: ${active}`);
      await demo.js(async () => { await app.workspace.getLeavesOfType('markdown')[0].openFile(app.vault.getAbstractFileByPath('Links.md')); });
      await sleep(400);
    }

    const vaultAfter = await demo.js(() => app.vault.getAllLoadedFiles().map(f => f.path).sort());
    check('no note or folder was created in the vault', JSON.stringify(vaultAfter) === JSON.stringify(vaultBefore),
      `new: ${vaultAfter.filter(p => !vaultBefore.includes(p)).join(', ')}`);

    // control: without the plugin, the tilde link creates the empty note (the bug)
    await demo.js(async () => { await app.plugins.disablePlugin('local-links'); });
    await demo.js(async ({ body }) => { await app.vault.modify(app.vault.getAbstractFileByPath('Links.md'), body); }, { body });
    await demo.js(async () => {
      const leaf = app.workspace.getLeavesOfType('markdown')[0];
      await leaf.setViewState({ type: 'markdown', state: { file: 'Links.md', mode: 'preview' } });
    });
    await sleep(700);
    const t = await demo.js(() => { const el = [...document.querySelectorAll('.markdown-reading-view a')].find(e => e.textContent.trim() === 'Tilde');
      const r = el.getBoundingClientRect(); return { x: r.left + 8, y: r.top + r.height / 2 }; });
    await demo.page.mouse.click(t.x, t.y);
    await sleep(1200);
    const created = await demo.js(() => app.vault.getAllLoadedFiles().map(f => f.path).filter(p => p.startsWith('~')));
    check('control: without the plugin the click creates ~/ in the vault', created.length > 0, 'nothing created, so the test does not reproduce the bug');
  } finally {
    await demo.close();
  }
  const failed = results.filter(r => !r).length;
  console.log(failed ? `\n${failed} failed` : '\nall passed');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
