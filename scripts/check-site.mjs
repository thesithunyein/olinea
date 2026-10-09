/*
 * Structural checks for the published site and the vault console.
 *
 * Run from the repository root:  node scripts/check-site.mjs
 *
 * These do not test behaviour — the Foundry suite does that. They test that nothing has drifted
 * apart: that every contract signature the docs cite still exists in the contract, that every anchor
 * resolves, that the console encodes the digest from exactly the five fields the vault hashes, that
 * the open holes in the deploy config stay closed, and that the honest limits are still stated.
 *
 * Reads files only. No network, no dependencies.
 */
import { readFileSync } from 'node:fs';

const fails = [];
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails.push(msg); };
const count = (hay, needle) => hay.split(needle).length - 1;

const home = readFileSync('index.html', 'utf8');
const docs = readFileSync('docs/index.html', 'utf8');
const app = readFileSync('app/index.html', 'utf8');
const worker = readFileSync('app/worker.js', 'utf8');

console.log('--- landing page ---');
ok(count(home, 'id="scene"') === 1, 'hero canvas present exactly once');
ok(count(home, 'bgTexture.dispose') === 1, 'background texture fix still present');
ok(count(home, "LINES = ['Quantum', 'Proof', 'USDC']") === 1, 'headline copy is Quantum/Proof/USDC');
ok(count(home, '<li class="nav-sm-hide">') === 3, 'three nav links marked mobile-hideable');
ok(count(home, '.nav-links li.nav-sm-hide { display: none; }') === 1, 'the mobile-hide rule exists in CSS');
ok(/<li><a href="\/docs\/">Docs<\/a><\/li>/.test(home), 'Docs is in the nav');
ok(/<li><a href="\/app\/">App<\/a><\/li>/.test(home), 'App is in the nav');
ok(count(home, 'details class="faq"') === 5, 'five FAQ entries, each one load-bearing');
ok(count(home, '<summary>') === 5, 'and the same five summaries');
ok(count(home, 'Open the app') === 1, 'hero CTA points at the app');
ok(count(home, 'href="/app/"') === 3, 'the app is linked from the nav, the hero and the footer, and nowhere twice');
/* The hero used to wait for 1.07 MB of model from a third-party host, on top of three.js, before it
   drew anything - and again for the webfont. Nothing may gate the first frame any more. */
ok(!home.includes('.glb') && !home.includes('GLTFLoader'),
  'the hero fetches no model: the cube is built from the geometry the addon already ships');
ok(home.includes('rel="modulepreload"') && home.includes('rel="preconnect" href="https://cdn.jsdelivr.net"'),
  'and its module host is preconnected and preloaded, so the fetch starts before the script is parsed');
ok(!home.includes('Promise.race([') && /^requestAnimationFrame\(animate\);$/m.test(home),
  'the first frame is drawn without waiting for the webfont');
/* The map has to be parsed before anything triggers a module load, and a module preload ahead of
   it makes Chrome throw the map away: every import in the page then fails to resolve. */
ok(home.indexOf('rel="modulepreload"') > home.indexOf('type="importmap"'),
  'the module preload comes after the import map, which is the only order that survives');
ok(count(home, '<div class="card">') === 3 && count(home, 'class="grid"') === 1,
  'the three claims sit in one auto-fitting row, not two rows with a hole in them');
ok(!home.includes('Loading model') && /function showNoScene\(\)/.test(home)
  && /classList\.add\('show'\)/.test(home),
  'nothing claims to be loading, and a browser without WebGL is told so once');
/* Simplicity is the point of this page: one hero, a few sections, nothing decorative that moves. */
ok(!home.includes('class="dots"') && !home.includes('id="prev"') && !home.includes('class="arrows"'),
  'the hero carries no controls for slides that do not exist');
ok(Buffer.byteLength(home) < 40000,
  `the landing stays a page a person can read (${Buffer.byteLength(home)} bytes)`);
ok(count(home, 'in the browser') === 0, 'stale "in the browser" signing claim removed');
ok(count(home, 'whiteboard') === 0 && count(home, 'Evidence') === 0, 'hackathon framing removed');

const refs = [...home.matchAll(/href="#([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
const ids = new Set([...home.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]));
const missing = refs.filter((r) => !ids.has(r));
ok(missing.length === 0, `every #anchor resolves (missing: ${missing.join(', ') || 'none'})`);

const dupIds = [...home.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
ok(new Set(dupIds).size === dupIds.length, 'no duplicate element ids');

const internal = [...home.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
const homeBad = internal.filter((h) =>
  h !== '/' && !h.startsWith('/docs/') && !h.startsWith('/app/') && !h.startsWith('/#'));
ok(homeBad.length === 0, `landing internal links are /, /docs/, /app/ or /#anchor (bad: ${homeBad.join(', ') || 'none'})`);

console.log('--- vault console ---');
ok(count(app, '<title>Vault console — Olinea</title>') === 1, 'app title');
ok(['overview', 'key', 'vault', 'authorize', 'activity'].every((n) =>
  count(app, `id="tab-${n}"`) === 1 && count(app, `id="panel-${n}"`) === 1), 'five sections exist, in the order the money moves');
const appIds = [...app.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
ok(new Set(appIds).size === appIds.length, 'app has no duplicate element ids');

/* The stylesheet contains [role="tabpanel"] too, so anything counting markup has to look at the
   markup with the stylesheet removed, or it passes for the wrong reason. */
const appMarkup = app.replace(/<style>[\s\S]*?<\/style>/g, '');
const attr = (s, name) => (s.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`)) || [])[1];
const tabs = [...appMarkup.matchAll(/<button class="tab" id="(tab-[a-z]+)"([^>]*)>/g)]
  .map(([, id, rest]) => ({ id, rest }));
const panels = [...appMarkup.matchAll(/<section id="(panel-[a-z]+)"([^>]*)>/g)]
  .map(([, id, rest]) => ({ id, rest })).filter((p) => attr(p.rest, 'role') === 'tabpanel');
ok(tabs.length === 5, 'the markup declares five tabs');
ok(tabs.every((t) => attr(t.rest, 'role') === 'tab'), 'every tab says it is a tab');
ok(panels.length === 5, 'the markup declares five panels');
ok(tabs.every((t) => appIds.includes(attr(t.rest, 'aria-controls'))), 'every tab points at a panel that exists');
ok(tabs.every((t) => attr(t.rest, 'aria-controls') === attr(t.rest, 'data-panel')), 'each tab points at the panel it shows');
ok(panels.every((p) => tabs.some((t) => t.id === attr(p.rest, 'aria-labelledby'))), 'every panel is labelled by a tab that exists');
ok(panels.every((p) => tabs.some((t) => attr(t.rest, 'aria-controls') === p.id)), 'every panel is the one its tab points at');
ok(tabs.filter((t) => attr(t.rest, 'aria-selected') === 'true').length === 1, 'exactly one tab starts selected');
/* A tablist is one stop in the page's tab order; the arrow keys move inside it. Otherwise a screen
   reader walks four buttons to do one job. */
ok(tabs.filter((t) => attr(t.rest, 'tabindex') === '0').length === 1, 'exactly one tab starts in the tab order');
ok(tabs.filter((t) => attr(t.rest, 'tabindex') === '-1').length === 4, 'the rest are reachable only by the arrow keys');
ok(/ArrowRight/.test(app) && /ArrowLeft/.test(app) && /'Home'/.test(app) && /'End'/.test(app),
  'the arrow, Home and End keys move between the tabs');
ok(/tab\.tabIndex = on \? 0 : -1/.test(app), 'moving a tab also moves the tab-order stop');

/* A real app never hands its user an infrastructure address, and never shows them a deploy
   command containing a private key. Both were in here once; both are now regressions. */
ok(count(app, 'id="factory-in"') === 0, 'the app never asks the user to paste a factory address');
ok(!app.includes('$ARC_PK'), 'the app never shows a deploy command with a private key in it');
ok(app.includes('Vaults open with the next deployment'), 'with nothing deployed the app says so in plain language');
ok(app.includes('beforeunload'), 'closing the tab with a key in memory asks first');
ok(/new Worker\('\/app\/worker\.js', \{ type: 'module' \}\)/.test(app), 'the worker is loaded as a module from /app/');
ok(worker.includes('olinea/slh-dsa/v1'), 'the derivation salt is versioned');
ok(count(worker, 'olinea/slh-dsa/v1') === 1, 'the derivation salt is defined in one place');
ok(worker.includes("type === 'words'") && worker.includes('generateMnemonic'), 'a backup is generated only when asked for');
ok(worker.includes('256'), 'the backup comes from 256 bits of entropy');
ok(worker.includes('hkdf(') && worker.includes('48'), 'the seed is stretched by HKDF to the 48 bytes SLH-DSA keygen takes');
ok(worker.includes('slh_dsa_sha2_128s') && !app.includes('slh_dsa_sha2_128s'),
  'only the worker imports the PQ primitive');
ok(worker.includes('validateMnemonic'), 'a restored backup is checksum-validated before a key is derived');

for (const a of ['0x1800000000000000000000000000000000000004', '0x3600000000000000000000000000000000000000']) {
  ok(app.includes(a), `the app cites ${a.slice(0, 10)}…`);
}
ok(app.includes('verifySlhDsaSha2128s'), 'the app calls the real precompile method');
ok(count(app, "{ type: 'uint256' }, { type: 'address' }") === 1,
  'the digest is encoded from exactly the five fields the contract hashes');
ok(count(app, 'authorizationDigest') >= 2, 'the app cross-checks its digest against the contract&rsquo;s own');
ok(app.includes('createVault') && app.includes('deposit') && app.includes('release'),
  'the app can create, fund and spend from a vault');
ok(count(app, 'retryCount: 0') === 3, 'transports do not retry definitive reverts');
/* The derivation itself lives only in the worker. The app may display the label, but it must not
   perform the HKDF step itself, or the two would be able to drift apart. */
ok(count(worker, "const DERIVATION_SALT = 'olinea/slh-dsa/v1'") === 1, 'the salt is declared once, in the worker');
ok(!app.includes('hkdf('), 'the app does not repeat the key derivation');

ok(app.includes('not deployed'), 'the app is honest that the factory is not deployed');
ok(/unaudited/i.test(app), 'the app is honest about the audit status');
ok(app.includes('denylist'), 'the app repeats the Circle denylist limit');
ok(app.includes('localStorage') && /gas, nothing more/.test(app), 'the built-in account is labelled honestly');
ok(app.includes('7,856') || app.includes('7856'), 'the app states the real signature size');

const appRefs = [...app.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
const appBad = appRefs.filter((h) => h !== '/' && h !== '/docs/' && h !== '/app/');
ok(appBad.length === 0, `app internal links are /, /docs/ or /app/ (bad: ${appBad.join(', ') || 'none'})`);
for (const b of ['b-new', 'b-derive', 'b-prove', 'b-create', 'b-deposit', 'b-sign', 'b-release']) {
  ok(appIds.includes(b), `the app has an element for #${b}`);
}

/* --- the check tool ---
   A recipient has no key, no wallet and nothing to spend, so nothing about it may be gated on a
   key, and nothing the file says about itself may be taken on trust. */
const verifyAt = appMarkup.indexOf('id="verify-card"');
ok(count(app, 'id="verify-card"') === 1, 'the check tool is in the markup once');
ok(verifyAt > appMarkup.indexOf('id="panel-authorize"') && verifyAt < appMarkup.indexOf('id="panel-activity"'),
  'the check tool sits in the Authorize panel, not loose on every panel');
ok(!/verify-card'\)\.hidden/.test(app), 'the check tool is never hidden behind a key');
ok(count(app, 'const digestFor =') === 1 && count(app, 'digestFor(') === 2,
  'the digest a file arrives with is recomputed by the same code that builds a real one');
ok(count(app, "const RELEASE_TYPES =") === 1 && count(app, 'inputs: RELEASE_TYPES') === 2,
  'the builder and the checker share one description of a release');
ok(app.includes('decodeAbiParameters') && !app.includes('decodeFunctionData'),
  'the calldata is checked by selector and then decoded with explicit types');
ok(app.includes('RELEASE_SELECTOR') && app.includes('V.toFunctionSelector'),
  'the selector the check compares against is derived, not typed in');
ok(count(app, 'V.parseUnits(') === 1, 'amounts are parsed in one place, in USDC');
ok(app.includes('HISTORY_WINDOW = 20_000n') && !app.includes('1_000_000n'),
  'the log scan is bounded to a window a public RPC will actually answer');
ok(/net-block'\)\.textContent = ''/.test(app), 'the block number is withdrawn the moment the RPC stops answering');
ok(/sendable: failed\.length === 0 && vaultKey !== null && accepted !== false/.test(app),
  'sending is offered only where the chain itself confirmed the signature');
ok(count(app, 'PQ_SIG_BYTES = 7856') === 1, 'the signature length the file checks use is the measured one');

console.log('--- console dashboard ---');
/* An author rule carrying a class outranks the user agent's [hidden] rule, so a hidden flex row
   painted as an empty greyed-out button on the first screen. Nothing hidden may ever be drawn. */
ok(/\[hidden\]\s*\{\s*display:\s*none\s*!important/.test(app),
  'nothing an author display rule can paint survives the hidden attribute');
const tiles = [...appMarkup.matchAll(/<button class="stat" type="button" data-goto="([a-z-]+)" id="(stat-[a-z]+)">/g)]
  .map(([, to, id]) => ({ to, id }));
ok(tiles.length === 5, `the console opens on five facts (found ${tiles.length})`);
ok(tiles.every((t) => appIds.includes(t.to)), 'every tile opens a panel that exists');
/* The chain tile's second line is the block number, which net() owns under the name it withdraws
   the moment nothing answers, so that one tile names it differently. */
const SECOND_LINE = { 'stat-chain': 'net-block' };
ok(tiles.every((t) => appIds.includes(t.id) && appIds.includes(`${t.id}-v`)
  && appIds.includes(SECOND_LINE[t.id] || `${t.id}-s`)), 'every tile has a value and a line under it');
const statsAt = appMarkup.indexOf('class="stats"');
ok(statsAt > appMarkup.indexOf('id="panel-overview"') && statsAt < appMarkup.indexOf('id="panel-key"'),
  'the dashboard is the Overview section, ahead of the sections it summarises');
ok(count(app, 'function renderStats()') === 1 && count(app, 'renderStats();') >= 5,
  'the tiles are repainted from state rather than written once');
ok(count(app, 'id="net-block"') === 1, 'the chain card owns the height of the chain');
/* The sections are the bar's own navigation now, so they cannot scroll away with the content. */
const navAt = appMarkup.indexOf('<nav class="tabs"');
ok(appMarkup.indexOf('<header class="appbar">') >= 0 && navAt > appMarkup.indexOf('<header class="appbar">')
  && navAt < appMarkup.indexOf('</header>'), 'the sections live in the app bar');
ok(/\.appbar\s*\{[^}]*position:\s*sticky/.test(app), 'and the bar stays put');
ok(count(app, 'function renderNext()') === 1 && count(app, 'renderNext()') >= 2 && app.includes('id="next-btn"'),
  'the dashboard names one next action and opens the tab that does it');
ok(count(app, 'const HEADINGS =') === 1
  && ['panel-overview', 'panel-key', 'panel-vault', 'panel-authorize', 'panel-activity'].every((id) => app.includes(`'${id}': [`)),
  'every section says what it is at the top of the page');
ok(app.includes('name="color-scheme" content="light"') && /--bg:#fff/.test(app),
  'the console is a light surface, the way a product is');
/* The reference shows a flow as three steps, so the Authorize panel does too - and a step counts
   as done only when the signature, the precompile or the receipt itself said so. */
ok(appMarkup.indexOf('id="auth-steps"') > appMarkup.indexOf('id="auth-body"')
  && count(app, 'id="step-fill"') === 1, 'the authorization flow says how far along it is');
ok(count(app, 'function renderSteps()') === 1 && /renderAuth\(\)\s*\{[\s\S]*?renderSteps\(\);/.test(app),
  'and repaints itself with the panel it belongs to');
ok(app.includes('const checked = sent || state.authVerified === true')
  && app.includes("$('step-bar').setAttribute('aria-valuenow', String(done))"),
  'a step is done only when the chain or the signature said so');
/* The bar itself carries the role, so the number has to land on the bar and not on the card. */
ok(/<div class="steps" id="step-bar" role="progressbar"/.test(appMarkup),
  'and the progress bar reports it on the element that claims to be one');
ok(/\.btn\.ghost\s*\{[^}]*border-color:\s*var\(--acc\)/.test(app),
  'the secondary button is an outline, the way the reference draws it');
ok(/\.kv dt \{ color: var\(--link\)/.test(app) && /\.kv dd \{[^}]*color: var\(--fg\)/.test(app),
  'a details table labels its rows in green over ink values, the way the reference prints them');
/* The limits were printed under every screen; they are one click away now, and the button has to
   say which way it is - and the limits themselves must not have been quietly dropped. */
ok(appMarkup.includes('id="b-info"') && appMarkup.includes('id="limits" hidden')
  && app.includes("$('b-info').onclick") && app.includes("$('b-info').setAttribute('aria-expanded'"),
  'the limits sit behind the info button, which reports whether they are open');
ok(['Unaudited', 'Release only', 'denylist', 'No recovery'].every((s) => app.includes(s)),
  'and every honest limit is still written down behind it');
/* Counting `<svg class="ico"` would miss the chevrons, which carry a second class. */
const icons = count(app, '<svg class="ico');
ok(icons >= 10 && !app.includes('<use') && !/iconfont/.test(app),
  `the console draws its own icons inline, with no sprite or icon font to fetch (found ${icons})`);
ok(/\.chev\s*\{[^}]*transition/.test(app)
  && /details\.adv\[open\] summary \.chev \{ transform: rotate\(180deg\)/.test(app),
  'the advanced disclosures carry an icon, and their chevron turns when they open');
/* The reference tables name their columns above the rows; the record is the only list here that has
   columns to name, and it must not name them when it is empty. */
ok(/\.histhead\s*\{[^}]*background:\s*var\(--sunken\)/.test(app)
  && /const HIST_HEAD = '<div class="histhead">/.test(app) && app.includes('${HIST_HEAD}${logs.slice'),
  'the record table names its columns, and only over rows it actually has');
ok(appMarkup.includes('id="b-explorer"') && appMarkup.includes('id="step-link" hidden')
  && app.includes("$('step-link').hidden = !sent")
  && app.includes("$('b-explorer').href = `https://explorer.arc.io/tx/${state.released.hash}`"),
  'the status card offers the explorer, pointed at the transaction that was actually sent');

/* ---------------- the console as a piece of design, not just as a set of features ----------------
   Each of the following was measured in a browser before it was changed: a colour ratio, a tile
   that wrapped four-then-one, a focus ring that was missing, an empty state drawn as a bullet. */
ok(/--dim:#63766d;/.test(app) && !/--dim:#71837b/.test(app),
  '--dim is dark enough to read: #71837b measured 4.01:1 on white, under the 4.5:1 floor');
ok(/input::placeholder, textarea::placeholder \{ color: var\(--dim\); \}/.test(app),
  'and the placeholder that used to be the faintest text in the app uses that same colour');
ok(/\.stats\s*\{[^}]*grid-template-columns: repeat\(5,/.test(app) && !app.includes('auto-fit, minmax(184px'),
  'the five tiles have explicit column counts, so none of them strands on a row of its own');
ok(/@media \(max-width: 1180px\) \{ \.stats \{ grid-template-columns: repeat\(3,/.test(app)
  && /\.stats \.stat:last-child \{ grid-column: 1 \/ -1; \}/.test(app),
  'and the fifth tile takes the whole row whenever it would otherwise be alone');
ok(/\.stat-val \{[^}]*font-variant-numeric: tabular-nums/.test(app),
  'the chain height cannot drag its tile wider as it ticks');
ok(app.includes('.copy:focus-visible, .info:focus-visible'),
  'the info button carries the same focus ring as every other control');
ok(app.includes('@media (pointer: coarse)') && /\.tab \{ min-height: 44px; \}/.test(app),
  'on a touch screen the tabs and the info button are finger-sized');
ok(count(app, '&#9679;') === 0 && count(app, 'class="glyph"><svg') === 3
  && /\.empty \.glyph svg \{/.test(app),
  'every empty state draws its icon, instead of printing a bullet in a circle');
ok(/const ACT_HEAD = '<div class="histhead"><span>State<\/span>/.test(app)
  && app.includes('${ACT_HEAD}<div class="histrow">'),
  'the activity record names its columns too, the way the vault record does');
ok(app.includes("state.vaultBal : 'None'") && !appMarkup.includes('id="stat-vault-v">—<'),
  'an empty vault tile says None, the same word the key and gas tiles use');
ok(appMarkup.includes('id="b-goto-key3"') && app.includes("$('b-goto-key3').onclick = () => show('panel-key')"),
  'the empty activity panel offers the one action that fills it');
ok(count(app, '<h2>Activity</h2>') === 0 && !app.includes('Nothing yet. Prove your key on the Key tab.'),
  'the activity panel no longer titles itself twice or says the same thing twice');

const factory = readFileSync('contracts/src/OlineaFactory.sol', 'utf8');
ok(factory.includes('function createVault(bytes calldata verifyingKey)'), 'the factory really has createVault(bytes)');
for (const sig of ['vaultsOf', 'vaultCount', 'vaultAt']) {
  ok(factory.includes(`function ${sig}(`), `the factory really has ${sig}()`);
}
ok(factory.includes('public isVault'), 'the factory really exposes isVault');

console.log('--- docs page ---');
ok(count(docs, '<title>Docs — Olinea</title>') === 1, 'docs title');
for (const sid of ['overview', 'status', 'quickstart', 'vault', 'digest', 'precompile', 'cli', 'security', 'limits', 'deploy']) {
  ok(count(docs, `id="${sid}"`) === 1, `docs has section #${sid}`);
}
const tocRefs = [...docs.matchAll(/href="#([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]);
const docIds = new Set([...docs.matchAll(/id="([a-zA-Z0-9_-]+)"/g)].map((m) => m[1]));
const tocMissing = tocRefs.filter((r) => !docIds.has(r));
ok(tocMissing.length === 0, `docs table of contents resolves (missing: ${tocMissing.join(', ') || 'none'})`);

const vault = readFileSync('contracts/src/OlineaVault.sol', 'utf8');
for (const sig of ['release(address to, uint256 amount, uint256 nonce, bytes calldata signature)', 'deposit(uint256 amount)', 'authorizationDigest(address to, uint256 amount, uint256 nonce)']) {
  ok(vault.includes(sig), `contract source still declares: ${sig.slice(0, 46)}`);
}
for (const fn of ['deposit(uint256)', 'release(address,uint256,uint256,bytes)', 'nonceUsed', 'authorizationDigest(', 'pqVerifier', 'verifyingKey', 'balance()']) {
  ok(docs.includes(fn), `docs reference the real function: ${fn}`);
}
ok(count(docs, '0x1800000000000000000000000000000000000004') >= 1, 'docs cite the canonical precompile address');
ok(docs.includes('0xbf4db8ba') && docs.includes('382,879') && docs.includes('7856'), 'docs cite selector, gas and signature size');
ok(count(docs, '0x3600000000000000000000000000000000000000') >= 1, 'docs cite the USDC ERC-20 address');
ok(docs.includes('keccak256(abi.encode(block.chainid, address(vault), to, amount, nonce))'), 'docs state the exact digest');
ok(docs.includes('Not yet deployed'), 'docs are honest about deployment status');
ok(docs.includes('Unaudited') && docs.includes('None'), 'docs are honest about the audit status');
ok(docs.includes('href="/app/"'), 'docs point at the app');

console.log('--- copy ---');
/* Short, scannable lines. This is the one property that quietly rots: a clause gets added, then
   another, and a page that read well starts to look like a wall of words. 280 characters is about
   three lines at the widths these pages use. */
const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
const walls = [];
for (const [name, html] of [['landing', visible(home)], ['docs', visible(docs)], ['app', visible(app)]]) {
  for (const m of html.matchAll(/<(p|li|figcaption)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const text = m[2].replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/g, 'x').replace(/\s+/g, ' ').trim();
    if (text.length > 280) walls.push(`${name} ${text.length}c "${text.slice(0, 48)}…"`);
  }
}
ok(walls.length === 0, `no paragraph reads like a wall of words (over 280c: ${walls.join(' | ') || 'none'})`);

console.log(fails.length ? `\n${fails.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
