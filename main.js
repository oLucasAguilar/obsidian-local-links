'use strict';

const obsidian = require('obsidian');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');

const DEFAULT_SETTINGS = {
  browserCommand: 'brave-browser',
  browserExtensions: 'html, htm',
};

// Turns what a link points to into a path on disk, or null when the link is not local.
// `~/x`, `/abs/x` and `file:///abs/x` count; anything else is left to Obsidian.
function parseLocal(raw, home) {
  if (typeof raw !== 'string') return null;
  let text = raw.trim();
  if (!text) return null;

  if (/^file:\/\//i.test(text)) {
    let url;
    try { url = new URL(text); } catch { return null; }
    if (url.host && url.host !== 'localhost') return null;
    return { path: safeDecode(url.pathname), fragment: url.hash, form: 'file' };
  }

  let form;
  if (text === '~' || text.startsWith('~/')) form = 'tilde';
  else if (text.startsWith('/')) form = 'absolute';
  else return null;

  text = safeDecode(text);
  if (form === 'tilde') text = home + text.slice(1);
  return splitFragment(text, form);
}

// A `#` may belong to the file name; the fragment is only what sits after the last `#`
// when the part before it is what exists on disk.
function splitFragment(text, form, exists = fs.existsSync) {
  const hash = text.lastIndexOf('#');
  if (hash < 0 || exists(text)) return { path: text, fragment: '', form };
  return { path: text.slice(0, hash), fragment: text.slice(hash), form };
}

function safeDecode(text) {
  try { return decodeURIComponent(text); } catch { return text; }
}

// `/x` in Obsidian is also a link from the vault root, so an absolute path is only taken
// when the vault cannot resolve it and it is a real place on disk (or under the home folder).
function shouldHandle(target, { home, resolvesInVault, exists = fs.existsSync }) {
  if (!target) return false;
  if (target.form === 'tilde' || target.form === 'file') return true;
  if (resolvesInVault) return false;
  return exists(target.path) || target.path === home || target.path.startsWith(home + '/');
}

function parseExtensions(list) {
  return String(list || '')
    .split(/[\s,]+/)
    .map(e => e.replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

// Decides how a target opens: in the browser as a file URL, or with the system's default app.
function planOpen(target, settings, isDirectory) {
  const ext = path.extname(target.path).slice(1).toLowerCase();
  const command = String(settings.browserCommand || '').trim().split(/\s+/).filter(Boolean);
  if (!isDirectory && command.length && parseExtensions(settings.browserExtensions).includes(ext)) {
    const url = pathToFileURL(target.path).href + target.fragment;
    return { how: 'browser', bin: command[0], args: [...command.slice(1), url] };
  }
  return { how: 'system', path: target.path };
}

const BARE_FILE_URL = /file:\/\/\/[^\s<>"'`)\]]+/g;

// Splits text into plain strings and file URLs, in order.
function splitBareFileUrls(text) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(BARE_FILE_URL)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ url: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Reading view leaves a bare file:/// as plain text (Live Preview links it), so it gets an anchor here.
function linkifyBareFileUrls(root) {
  const doc = root.ownerDocument;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeValue.includes('file:///') && !n.parentElement.closest('a, code, pre')) nodes.push(n);
  }
  for (const node of nodes) {
    const frag = doc.createDocumentFragment();
    for (const part of splitBareFileUrls(node.nodeValue)) {
      if (typeof part === 'string') { frag.appendChild(doc.createTextNode(part)); continue; }
      const a = doc.createElement('a');
      a.className = 'external-link';
      a.href = part.url;
      a.textContent = part.url;
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener nofollow');
      frag.appendChild(a);
    }
    node.replaceWith(frag);
  }
}

class LocalLinksPlugin extends obsidian.Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.home = os.homedir();
    this.addSettingTab(new LocalLinksSettingTab(this.app, this));
    this.patchOpenLinkText();
    this.patchWindowOpen();
    this.registerMarkdownPostProcessor(el => linkifyBareFileUrls(el));
  }

  notify(message) {
    new obsidian.Notice(`Local Links: ${message}`);
  }

  onunload() {
    for (const restore of this.restores || []) restore();
  }

  addRestore(fn) {
    (this.restores = this.restores || []).push(fn);
  }

  // Internal links (`~/x`, `/x`) reach the workspace here, in Reading view and Live Preview alike.
  patchOpenLinkText() {
    const workspace = this.app.workspace;
    const original = workspace.openLinkText;
    const plugin = this;
    workspace.openLinkText = function (linktext, sourcePath, ...rest) {
      const target = parseLocal(linktext, plugin.home);
      const resolvesInVault = target && target.form === 'absolute'
        && !!plugin.app.metadataCache.getFirstLinkpathDest(obsidian.getLinkpath(linktext).replace(/^\//, ''), sourcePath || '');
      if (shouldHandle(target, { home: plugin.home, resolvesInVault })) {
        plugin.openTarget(target);
        return Promise.resolve();
      }
      return original.call(this, linktext, sourcePath, ...rest);
    };
    this.addRestore(() => { workspace.openLinkText = original; });
  }

  // External links (`file:///x`) are opened by Obsidian through window.open.
  patchWindowOpen() {
    const original = window.open;
    const plugin = this;
    window.open = function (url, ...rest) {
      const target = parseLocal(typeof url === 'string' ? url : String(url || ''), plugin.home);
      if (target && target.form === 'file') {
        plugin.openTarget(target);
        return null;
      }
      return original.call(this, url, ...rest);
    };
    this.addRestore(() => { window.open = original; });
  }

  openTarget(target) {
    let stat;
    try { stat = fs.statSync(target.path); } catch {
      this.notify(`não existe\n${target.path}`);
      return;
    }
    const plan = planOpen(target, this.settings, stat.isDirectory());
    if (plan.how === 'browser') {
      const child = spawn(plan.bin, plan.args, { detached: true, stdio: 'ignore' });
      child.on('error', err => {
        this.notify(`"${plan.bin}" falhou (${err.code || err.message}); abrindo com o app padrão.`);
        this.openWithSystem(target.path);
      });
      child.unref();
      return;
    }
    this.openWithSystem(plan.path);
  }

  openWithSystem(p) {
    require('electron').shell.openPath(p).then(err => {
      if (err) this.notify(err);
    });
  }
}

class LocalLinksSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    const save = key => async value => {
      this.plugin.settings[key] = value;
      await this.plugin.saveData(this.plugin.settings);
    };
    new obsidian.Setting(containerEl)
      .setName('Browser command')
      .setDesc('Opens the extensions below as file:// URLs. Arguments are split on spaces. Empty: use the system default app.')
      .addText(t => t.setPlaceholder('brave-browser').setValue(this.plugin.settings.browserCommand).onChange(save('browserCommand')));
    new obsidian.Setting(containerEl)
      .setName('Browser extensions')
      .setDesc('Comma separated. Other files and folders open with the system default app.')
      .addText(t => t.setPlaceholder('html, htm').setValue(this.plugin.settings.browserExtensions).onChange(save('browserExtensions')));
  }
}

module.exports = LocalLinksPlugin;
module.exports.parseLocal = parseLocal;
module.exports.splitFragment = splitFragment;
module.exports.shouldHandle = shouldHandle;
module.exports.planOpen = planOpen;
module.exports.parseExtensions = parseExtensions;
module.exports.splitBareFileUrls = splitBareFileUrls;
