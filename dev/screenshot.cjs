// Builds docs/demo-dark.png and docs/demo-light.png: a real Obsidian note on the left,
// a drawn browser window on the right. Run: dev/screenshot.sh
const fs = require('fs'), path = require('path'), os = require('os');
const { chromium } = require(process.env.PLAYWRIGHT_CORE);
const { open, sleep } = require('./obsidian-demo.cjs');

const id = 'local-links';
const pluginDir = path.join(__dirname, '..');
const out = path.join(pluginDir, 'docs');
const SCALE = 2;

const NOTE = 'Read before the meeting:\n\n[Study](~/notes/study.html)\n';

const THEMES = {
  dark: { frame: '#262626', bar: '#1b1b1b', field: '#333', text: '#dadada', muted: '#8a8a8a', line: '#3a3a3a', page: '#1e1e1e', accent: '#a78bfa', border: '#3a3a3a' },
  light: { frame: '#f3f3f3', bar: '#e9e9e9', field: '#fff', text: '#222', muted: '#777', line: '#e2e2e2', page: '#fff', accent: '#7c3aed', border: '#d6d6d6' },
};

async function shootNote(theme) {
  const demo = await open({ id, pluginDir, files: ['main.js', 'manifest.json'], notes: { 'Week notes.md': NOTE }, openNote: 'Week notes', theme, width: 430, height: 190, port: 9361,
    css: '.inline-title{font-size:1.6em}.cm-scroller{padding-top:24px!important}::-webkit-scrollbar{display:none}' });
  try {
    const cdp = await demo.page.context().newCDPSession(demo.page);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 430, height: 190, deviceScaleFactor: SCALE, mobile: false });
    await sleep(400);
    await demo.cursor(2, 1); // the cursor on the link line shows the raw ~/ path
    await sleep(400);
    const at = await demo.textStart('.cm-line', '~/notes');
    await demo.js(({ x, y }) => { // pointer drawn on the path, since screenshots show no OS cursor
      const p = document.createElement('div');
      p.innerHTML = '<svg width="18" height="26" viewBox="0 0 18 26"><path d="M1 1 L1 20 L6 15 L10 24 L13 23 L9 14 L16 14 Z" fill="white" stroke="black" stroke-width="1.5"/></svg>';
      p.style.cssText = `position:fixed;left:${x}px;top:${y}px;pointer-events:none;z-index:999999`;
      document.body.appendChild(p);
      document.querySelectorAll('.cm-cursor').forEach(c => c.style.display = 'none');
    }, { x: at.x + 125, y: at.y + 9 });
    const file = path.join(os.tmpdir(), `local-links-note-${theme}.png`);
    await demo.page.screenshot({ path: file });
    return file;
  } finally { await demo.close(); }
}

function page(theme, noteFile) {
  const c = THEMES[theme];
  const img = fs.readFileSync(noteFile).toString('base64');
  const skel = (w) => `<div style="height:9px;width:${w}%;background:${c.line};border-radius:5px;margin:0 0 11px"></div>`;
  return `<!doctype html><html><body style="margin:0;background:transparent">
  <div id="shot" style="display:inline-flex;align-items:center;gap:22px;padding:20px;font:13px system-ui,sans-serif">
    <img src="data:image/png;base64,${img}" style="width:430px;height:190px;border-radius:10px;border:1px solid ${c.border};box-shadow:0 4px 18px rgba(0,0,0,.18)">
    <svg width="44" height="20" viewBox="0 0 44 20"><path d="M2 10 H38 M30 3 L39 10 L30 17" fill="none" stroke="${c.accent}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div style="width:340px;height:190px;border-radius:10px;overflow:hidden;border:1px solid ${c.border};background:${c.page};box-shadow:0 4px 18px rgba(0,0,0,.18);display:flex;flex-direction:column">
      <div style="background:${c.bar};padding:9px 12px;display:flex;align-items:center;gap:7px;border-bottom:1px solid ${c.border}">
        <span style="width:9px;height:9px;border-radius:50%;background:#ff5f57"></span><span style="width:9px;height:9px;border-radius:50%;background:#febc2e"></span><span style="width:9px;height:9px;border-radius:50%;background:#28c840"></span>
        <div style="flex:1;margin-left:8px;background:${c.field};color:${c.muted};border-radius:6px;padding:4px 10px;font-size:12px;white-space:nowrap;overflow:hidden">file:///home/me/notes/study.html</div>
      </div>
      <div style="padding:22px 24px">
        <div style="color:${c.text};font-size:20px;font-weight:650;margin-bottom:16px">Study</div>
        ${skel(92)}${skel(80)}${skel(86)}${skel(55)}
      </div>
    </div>
  </div></body></html>`;
}

(async () => {
  const notes = {};
  for (const theme of ['dark', 'light']) notes[theme] = await shootNote(theme);
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/usr/bin/brave-browser' }); // any Chromium; no Playwright download needed
  try {
    for (const theme of ['dark', 'light']) {
      const p = await browser.newPage({ deviceScaleFactor: SCALE });
      await p.setContent(page(theme, notes[theme]));
      await p.locator('#shot').screenshot({ path: path.join(out, `demo-${theme}.png`), omitBackground: true });
      await p.close();
      fs.rmSync(notes[theme]);
    }
  } finally { await browser.close(); }
  for (const theme of ['dark', 'light']) console.log(path.join(out, `demo-${theme}.png`), Math.round(fs.statSync(path.join(out, `demo-${theme}.png`)).size / 1024) + ' KB');
})().catch(e => { console.error(e); process.exit(1); });
