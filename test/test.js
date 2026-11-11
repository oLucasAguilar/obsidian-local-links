/* Checks how links are read and how they open. Obsidian's API is stubbed, so this
 * runs with plain node and needs no vault. The real click is checked by dev/e2e.cjs. */

const Module = require('module');

class Fake {}
const fakeObsidian = { Plugin: Fake, PluginSettingTab: Fake, Setting: Fake, Notice: Fake, getLinkpath: s => s };
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'obsidian') return fakeObsidian;
  return load.call(this, request, ...rest);
};

const { parseLocal, splitFragment, shouldHandle, planOpen, parseExtensions, splitBareFileUrls } = require('../main.js');

let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) console.log(`ok   ${name}`);
  else { failed++; console.log(`FAIL ${name}\n     got      ${a}\n     expected ${e}`); }
}

const home = '/home/u';
const none = () => false;

// parseLocal: what counts as local
check('tilde path', parseLocal('~/a/b.html', home), { path: '/home/u/a/b.html', fragment: '', form: 'tilde' });
check('tilde alone', parseLocal('~', home), { path: '/home/u', fragment: '', form: 'tilde' });
check('absolute path', parseLocal('/home/u/x.pdf', home), { path: '/home/u/x.pdf', fragment: '', form: 'absolute' });
check('file url', parseLocal('file:///home/u/a.html', home), { path: '/home/u/a.html', fragment: '', form: 'file' });
check('file url keeps fragment', parseLocal('file:///home/u/a.html#bg-deep', home), { path: '/home/u/a.html', fragment: '#bg-deep', form: 'file' });
check('file url decodes %20 and parens', parseLocal('file:///home/u/api%20(8).pdf', home).path, '/home/u/api (8).pdf');
check('tilde decodes %20', parseLocal('~/a%20b.html', home).path, '/home/u/a b.html');
check('file url on another host is not local', parseLocal('file://server/share/a.html', home), null);
check('plain note name is not local', parseLocal('Some note', home), null);
check('relative path is not local', parseLocal('folder/note.md', home), null);
check('~user is not local', parseLocal('~other/a', home), null);
check('https is not local', parseLocal('https://example.com', home), null);
check('empty is not local', parseLocal('  ', home), null);

// splitFragment: a # in the name survives when that is what exists
check('fragment split when the file before # exists', splitFragment('/a/b.html#sec', 'tilde', p => p === '/a/b.html'), { path: '/a/b.html', fragment: '#sec', form: 'tilde' });
check('# kept in name when the whole path exists', splitFragment('/a/#self/b.pdf', 'absolute', p => p === '/a/#self/b.pdf'), { path: '/a/#self/b.pdf', fragment: '', form: 'absolute' });

// shouldHandle: /x is also a vault-root link
check('tilde always handled, even if missing', shouldHandle({ path: '/home/u/missing', form: 'tilde' }, { home, resolvesInVault: false, exists: none }), true);
check('tilde wins over a stray ~/ folder in the vault', shouldHandle({ path: '/home/u/a.html', form: 'tilde' }, { home, resolvesInVault: true, exists: () => true }), true);
check('file url always handled', shouldHandle({ path: '/x', form: 'file' }, { home, resolvesInVault: false, exists: none }), true);
check('absolute that resolves in the vault goes to Obsidian', shouldHandle({ path: '/home/u/a', form: 'absolute' }, { home, resolvesInVault: true, exists: () => true }), false);
check('absolute on disk is handled', shouldHandle({ path: '/etc/hosts', form: 'absolute' }, { home, resolvesInVault: false, exists: () => true }), true);
check('missing absolute under home is handled (notice, no note)', shouldHandle({ path: '/home/u/gone.html', form: 'absolute' }, { home, resolvesInVault: false, exists: none }), true);
check('missing vault-root link goes to Obsidian (it may create the note)', shouldHandle({ path: '/Daily/new', form: 'absolute' }, { home, resolvesInVault: false, exists: none }), false);
check('nothing to handle', shouldHandle(null, { home }), false);

// planOpen: browser for the listed extensions, system app for the rest
const settings = { browserCommand: 'brave-browser --incognito', browserExtensions: 'html, .HTM' };
check('html goes to the browser with fragment', planOpen({ path: '/home/u/a b.html', fragment: '#x' }, settings, false),
  { how: 'browser', bin: 'brave-browser', args: ['--incognito', 'file:///home/u/a%20b.html#x'] });
check('extension match ignores case and dot', planOpen({ path: '/a/B.HTM', fragment: '' }, settings, false).how, 'browser');
check('pdf goes to the system app', planOpen({ path: '/a/b.pdf', fragment: '' }, settings, false), { how: 'system', path: '/a/b.pdf' });
check('folder goes to the system app', planOpen({ path: '/a/dir.html', fragment: '' }, settings, true).how, 'system');
check('empty browser command uses the system app', planOpen({ path: '/a/b.html', fragment: '' }, { browserCommand: '  ', browserExtensions: 'html' }, false).how, 'system');
check('extensions parse', parseExtensions(' html,htm  pdf ,, '), ['html', 'htm', 'pdf']);

// splitBareFileUrls: reading view leaves bare file:/// as text
check('bare file url is split out', splitBareFileUrls('see file:///a/b.html#x now'), ['see ', { url: 'file:///a/b.html#x' }, ' now']);
check('two bare urls', splitBareFileUrls('file:///a file:///b'), [{ url: 'file:///a' }, ' ', { url: 'file:///b' }]);
check('closing paren is not part of the url', splitBareFileUrls('(file:///a/b)'), ['(', { url: 'file:///a/b' }, ')']);
check('text without url stays whole', splitBareFileUrls('nothing here'), ['nothing here']);

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
