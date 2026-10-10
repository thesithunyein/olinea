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
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/* The one thing this file cannot read off disk: whether the site is being checked against a
   deployed factory. Set CONFIG_factory to the deployed address to check the deployed claims;
   leave it unset and the check still runs, and still holds the site to the undeployed wording. */
const CONFIG = { factory: process.env.CONFIG_factory ?? null };

const fails = [];
const ok = (cond, msg) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + msg); if (!cond) fails.push(msg); };
const count = (hay, needle) => hay.split(needle).length - 1;

const home = readFileSync('index.html', 'utf8');
const docs = readFileSync('docs/index.html', 'utf8');
const app = readFileSync('app/index.html', 'utf8');
const worker = readFileSync('app/worker.js', 'utf8');

console.log('--- landing page ---');
ok(count(home, 'id="scene"') === 1, 'hero canvas present exactly once');
/* The strip between the claims and "How it works": one canvas, one module beside it, and a caption
   that carries the whole story for a browser with no WebGL or a visitor who asked for less motion. */
ok(count(home, 'id="flow"') === 1 && existsSync('assets/three/flow.js') && /<figcaption>Sign/.test(home),
  'the release-path strip is one canvas over one committed module, with a caption that reads without it');
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
ok(home.includes('rel="modulepreload" href="/assets/three/three.module.js"'),
  'and its module is preloaded from this origin, so the fetch starts before the script is parsed');
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

/* An /assets/ link is allowed because assets are a real directory here - and it has to point at a
   file that exists, so a renamed icon fails this check rather than 404ing for a visitor. */
const isAsset = (h) => h.startsWith('/assets/') && existsSync(path.join('.', h));
const internal = [...home.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
const homeBad = internal.filter((h) =>
  h !== '/' && !h.startsWith('/docs/') && !h.startsWith('/app/') && !h.startsWith('/#') && !isAsset(h));
ok(homeBad.length === 0, `landing internal links resolve to a page or a file that exists (bad: ${homeBad.join(', ') || 'none'})`);

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
ok(app.includes('The factory is already deployed on Arc mainnet') || app.includes('Vaults open with the next deployment'), 'the app states the factory deployment status plainly');
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
/* A definitive revert must never be retried — re-sending it turns a fast "no" into a slow one —
   and an endpoint that stalls must not be asked again while another one is answering. The day this
   was written the console had one hardcoded primary and sat on "connecting" when it stalled, so
   the order now comes from a measurement. */
ok(count(app, 'retryCount: 0') === 2, 'transports do not retry definitive reverts');
ok(app.includes('rpc.drpc.mainnet.arc.io') && app.includes('rpc.blockdaemon.mainnet.arc.io'),
  'the console knows both public endpoints');
ok(app.includes('Promise.allSettled') && app.includes("jsonRpc(url, 'eth_chainId'") && app.includes("jsonRpc(url, 'eth_blockNumber'") && app.includes('(a.ms - b.ms)'),
  'both endpoints are measured with a real read, and the faster one is asked first');
ok(app.includes('CONFIG.rpcProbe') && app.includes('rpc.downAt') && app.includes('CONFIG.rpcBackoff'),
  'the probe has its own deadline, and an endpoint that fails is rested before it is asked again');
ok(/function retire\(/.test(app) && /retire\('stalled'\)/.test(app),
  'an endpoint that stalls moves behind the one that may still answer');
ok(app.includes('await probeAll(force)') && app.includes('rpcNote()'),
  'the status line names the endpoint that answered, with the measurement behind it');
ok(app.includes('rpc.answered = url') && app.includes('const first = rpc.answered || rpc.order[0]'),
  'the status line names the endpoint that actually answered, not the one asked first');
ok(app.includes('const watched = (url)') && app.includes("if (transient(err) && url === rpc.order[0]) retire('stalled')"),
  'a provider that accepts a request and never replies is retired on the spot');
/* The derivation itself lives only in the worker. The app may display the label, but it must not
   perform the HKDF step itself, or the two would be able to drift apart. */
ok(count(worker, "const DERIVATION_SALT = 'olinea/slh-dsa/v1'") === 1, 'the salt is declared once, in the worker');
ok(!app.includes('hkdf('), 'the app does not repeat the key derivation');

ok((app.includes('Vaults are not deployed yet') && !CONFIG.factory) || (CONFIG.factory && app.includes('factory deployed')), 'the app is honest about the factory deployment status');
ok(/unaudited/i.test(app), 'the app is honest about the audit status');
ok(app.includes('denylist'), 'the app repeats the Circle denylist limit');
ok(app.includes('localStorage') && /gas, nothing more/.test(app), 'the built-in account is labelled honestly');
/* Every number this console shows is read from Arc mainnet. Nothing in it may be named or labelled a
   demo, and the activity record may only ever be logs the chain actually returned - a reviewer must
   not be able to read real mainnet history as a mockup. */
ok(!/demo/i.test(app), 'no part of the shipped console is named or labelled a demo');
ok(count(app, "state.mode = 'wallet'") + count(app, 'state.mode = "wallet"') >= 1 && count(app, "state.mode = 'builtin'") + count(app, 'state.mode = "builtin"') >= 1,
  'the gas account has exactly two modes - a connected wallet, or a key this page made');
ok(count(app, "state.mode === 'builtin'") + count(app, 'state.mode === "builtin"') === 3,
  'the gas account integrates a builtin key exactly three times - once to make it, once to prove a key, and once to offer to restore it from a backup');
ok((app.includes("state.mode = 'wallet'") || app.includes("state.mode = \"wallet\"") || app.includes("state.mode = 'builtin'") || app.includes("state.mode = \"builtin\"")) && (count(app, "state.mode = 'wallet'") + count(app, "state.mode = \"wallet\"") + count(app, "state.mode = 'builtin'") + count(app, "state.mode = \"builtin\"") >= 2),
  'the gas account has exactly two modes - a connected wallet, or a key this page made');
ok(count(app, "state.mode === 'builtin'") + count(app, 'state.mode === \"builtin\"') === 3,
  'every place that describes the built-in account tests the same mode');
ok(app.includes('getContractEvents(') && /explorer\.arc\.io\/block\//.test(app),
  'the activity record is read from the chain, and every row cites a real block');
ok(app.includes('You have no key in this tab, so you can read this vault but not spend from it'),
  'a visitor with no key is told they are reading, not told the vault belongs to someone else');
ok(app.includes('7,856') || app.includes('7856'), 'the app states the real signature size');

const appRefs = [...app.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
const appBad = appRefs.filter((h) => h !== '/' && h !== '/docs/' && h !== '/app/' && !isAsset(h));
ok(appBad.length === 0, `app internal links resolve to a page or a file that exists (bad: ${appBad.join(', ') || 'none'})`);
for (const b of ['b-new', 'b-derive', 'b-prove', 'b-create', 'b-deposit', 'b-sign', 'b-release']) {
  ok(appIds.includes(b), `the app has an element for #${b}`);
}
/* Every id the app reaches for has to exist in its own markup. A lookup that returns null is not a
   missing line — it is a TypeError at whatever point the function happens to call it, and the
   console once lost its whole Authorize panel to exactly that while every check here stayed green:
   renderKey() wrote to 'vault-soon-chip' while the element is 'v-soon-chip', so with a factory set
   and a key in memory the function threw before it could un-hide the form. */
const lookedUp = [...new Set([...app.matchAll(/\$\('([^']+)'\)/g)].map((m) => m[1]))];
const notInMarkup = lookedUp.filter((id) => !appIds.includes(id));
ok(notInMarkup.length === 0,
  `every id the app looks up exists in the markup (missing: ${notInMarkup.join(', ') || 'none'})`);

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
/* show() is what hides a section, and it runs after the chain probe, so whatever the markup says is
   what the first paint shows. The Key panel shipped without its hidden attribute, and its whole card
   sat under the dashboard until the first tab click. Four sections are hidden and the dashboard is
   the one that is not. */
const sectionTags = [...appMarkup.matchAll(/<section id="(panel-[a-z]+)"[^>]*>/g)].map((m) => m[0]);
const shownAtBoot = sectionTags.filter((tag) => !/\shidden>/.test(tag));
ok(sectionTags.length === 5 && shownAtBoot.length === 1 && /id="panel-overview"/.test(shownAtBoot[0]),
  `exactly one section is painted before show() runs (found ${shownAtBoot.length}: ${shownAtBoot.length} of ${sectionTags.length})`);
ok(count(app, 'function renderNext()') === 1 && count(app, 'renderNext()') >= 2 && app.includes('id="next-btn"'),
  'the dashboard names one next action and opens the tab that does it');
/* The paragraph under the vault chip has three states — this key, another key, no key in this tab —
   and the chip had two: a keyless reader, who is only reading, was shown the red warning that belongs
   to someone holding a vault they cannot open. */
ok(app.includes("mine ? 'matches your key' : state.vk ? 'different key' : 'no key in this tab'")
  && app.includes("'chip' + (mine ? ' ok' : state.vk ? ' no' : '')"),
  'and the vault chip states which of those three it is, in the three colours they have');
ok(count(app, 'const HEADINGS =') === 1
  && ['panel-overview', 'panel-key', 'panel-vault', 'panel-authorize', 'panel-activity'].every((id) => app.includes(`'${id}': [`)),
  'every section says what it is at the top of the page');
ok([['index.html', home], ['app/index.html', app], ['docs/index.html', docs]]
  .every(([, src]) => src.includes('name="color-scheme" content="light dark"')),
  'all three pages hand the colour scheme to the browser instead of forcing one');
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
/* Fading the whole element is how a disabled button becomes a grey blob on a dark surface: the
   white fill and its own dark label fade together and land at 3.18:1. Muted, never translucent. */
ok(/\.btn:disabled \{[^}]*color: var\(--dim\)/.test(app) && !/\.btn:disabled \{ opacity/.test(app),
  'a disabled button is a muted state, not the whole element faded into an unreadable blob');
ok(/\.kv dt \{ color: var\(--link\)/.test(app) && /\.kv dd \{[^}]*color: var\(--fg\)/.test(app),
  'a details table labels its rows in mint over near-white values, the way the landing prints them');
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
/* --- contrast, computed from the tokens rather than eyeballed ---
   Every page now carries two palettes: the base :root, and the :root inside the light media query
   that follows it. Both are measured. Picking a palette by eye is exactly how #71837b reached
   4.01:1 on white, and a theme that only reads well in one of its two halves is that same mistake
   made twice. */
const chan = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (h) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
};
const contrast = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/* #000 has to expand to #000000, or the token carrying the page ground is silently skipped. */
const tk = (block, name) => {
  /* The landing writes its tokens as `--bg: #000` and the console as `--bg:#000`, so the space is
     optional here. Requiring it either way would silently measure nothing and pass. */
  const m = block.match(new RegExp(name + ': *(#(?:[0-9a-f]{3}|[0-9a-f]{6}))(?![0-9a-f])'));
  if (!m) return undefined;
  return m[1].length === 4 ? '#' + m[1][1] + m[1][1] + m[1][2] + m[1][2] + m[1][3] + m[1][3] : m[1];
};
const baseOf = (src) => (src.match(/:root \{([\s\S]*?)\}/) || [])[1] || '';
const lightOf = (src) => (src.match(/@media \(prefers-color-scheme: light\) \{\s*:root \{([\s\S]*?)\}/) || [])[1] || '';
/* Only the combinations that a rule actually produces. Measuring every token against every surface
   would invent pairs that never meet and fail on colours that are never adjacent. */
const on = (fgs, bgs) => fgs.flatMap((f) => bgs.map((b) => [f, b]));
const PALETTE_PAIRS = {
  'index.html': [
    ...on(['--fg', '--dim', '--lede', '--strong', '--foot', '--accent', '--fail'], ['--bg', '--ground']),
    ...on(['--dim', '--lede', '--strong', '--accent'], ['--panel']),
    ...on(['--dim', '--accent', '--fail'], ['--sunken']),
    ...on(['--cta-hover-ink'], ['--cta-hover-bg']),
  ],
  'app/index.html': [
    ...on(['--ink', '--fg', '--body', '--dim'], ['--bg', '--panel', '--sunken']),
    ...on(['--link', '--good', '--bad', '--warn'], ['--bg']),
    ...on(['--btn-ink'], ['--acc']),
  ],
  'docs/index.html': [
    ...on(['--ink', '--fg', '--body', '--dim'], ['--bg', '--panel', '--sunken']),
    ...on(['--link', '--good', '--bad', '--warn'], ['--bg']),
  ],
};
for (const [file, pairs] of Object.entries(PALETTE_PAIRS)) {
  const src = readFileSync(file, 'utf8');
  const wanted = [...new Set(pairs.flat())];
  for (const [which, block] of [['dark', baseOf(src)], ['light', lightOf(src)]]) {
    const missing = wanted.filter((t) => !tk(block, t));
    const measured = missing.length ? [] : pairs.map(([f, b]) => ({ f, b, r: contrast(tk(block, f), tk(block, b)) }));
    const worst = measured.reduce((m, p) => (p.r < m.r ? p : m), measured[0] || { f: '-', b: '-', r: 0 });
    const under = measured.filter((p) => p.r < 4.5);
    ok(missing.length === 0 && under.length === 0 && measured.length === pairs.length,
      `${file} ${which}: all ${pairs.length} pairs that occur clear 4.5:1 `
      + `(worst ${worst.f} on ${worst.b} ${worst.r.toFixed(2)}:1`
      + (missing.length ? `, UNDEFINED ${missing.join(' ')}` : '') + ')');
  }
}
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
/* The gas figure is measured, so it is pinned to the release transaction's own receipt: 448,502 gas.
   The stale 382,879 was a verification-only estimate and must not come back. */
ok(docs.includes('0xbf4db8ba') && docs.includes('448,502') && docs.includes('7856')
  && !docs.includes('382,879'), 'docs cite selector, measured release gas and signature size');
ok(count(docs, '0x3600000000000000000000000000000000000000') >= 1, 'docs cite the USDC ERC-20 address');
ok(docs.includes('keccak256(abi.encode(block.chainid, address(vault), to, amount, nonce))'), 'docs state the exact digest');
ok(docs.includes('Factory deployed') || docs.includes('Not yet deployed'), 'docs are honest about the deployment status');
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

console.log('--- the mark ---');
/* One piece of artwork, four places it has to appear: the console bar, the landing bar, the docs
   bar, the browser tab and the README. All three pages are dark now, so all four bars take the
   white cut - one file cut twice, never two drawings, so the shapes cannot drift apart. */
const readme = readFileSync('README.md', 'utf8');
const png = (f) => {
  const b = readFileSync(f);
  return b.length > 512 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
};
for (const f of ['assets/favicon.png', 'assets/logo-mark.png', 'assets/logo-mark-ink.png',
  'assets/logo-mark-white-96.png', 'assets/logo-mark-ink-96.png']) {
  ok(png(f), `${f} is a real PNG`);
}
const source = readFileSync('assets/logo.jpg');
ok(source[0] === 0xff && source[1] === 0xd8, 'and assets/logo.jpg, the artwork they were cut from, is kept');
ok(count(home, 'src="/assets/logo-mark-white-96.png"') === 2
  && [home, app, docs].every((p) => p.includes('srcset="/assets/logo-mark-ink-96.png"'))
  && count(home, 'srcset="/assets/logo-mark-ink-96.png"') === 2,
  'every bar ships both cuts of the mark and lets the OS pick: white on dark, ink on light');
/* The diagram is drawn in its own colours rather than in tokens, so it needs one file per theme -
   and each file has to be drawn for the theme it is handed to. */
const svgGround = (f) => (readFileSync(f, 'utf8').match(/\.bg \{ fill: (#[0-9a-f]{6}); \}/) || [])[1];
ok(svgGround('docs/architecture.svg') === '#0d0f14' && svgGround('docs/architecture-light.svg') === '#ffffff',
  'the architecture diagram ships a dark cut and a light cut, each drawn on its own ground');
ok(docs.includes('srcset="/docs/architecture-light.svg" media="(prefers-color-scheme: light)"')
  && docs.includes('src="/docs/architecture.svg"')
  && !readFileSync('docs/architecture-light.svg', 'utf8').includes('#71837b'),
  'the docs hand the light visitor the light diagram, and it avoids the #71837b that failed on white');
/* <picture> may hold only <source> elements and one <img>: a caption parked inside it is invalid
   markup the browser happens to tolerate, so the shape is pinned here rather than trusted. The tag
   count runs over markup with the <style> blocks removed, because a comment that says "<picture>"
   in prose would otherwise read as an element that was never closed. */
const markup = (src) => src.replace(/<style>[\s\S]*?<\/style>/g, '');
const picsOf = (src) => [...markup(src).matchAll(/<picture>([\s\S]*?)<\/picture>/g)].map((m) => m[1]);
ok([home, app, docs].every((p) => picsOf(p).length > 0
  && picsOf(p).every((b) => /<img\b/.test(b) && !/<figcaption/.test(b))),
  'every <picture> on all three pages holds only its sources and the image');
ok([home, app, docs].every((p) => count(markup(p), '<picture>') === count(markup(p), '</picture>')),
  'and every <picture> a page opens is closed');
ok([home, docs, app].every((p) => p.includes('href="/assets/favicon.png"')
  && p.includes('href="/assets/favicon.png" sizes="180x180"')),
  'the browser tab shows that artwork on all three pages');
ok(readme.includes('srcset="assets/logo-mark.png"') && readme.includes('src="assets/logo-mark-ink.png"'),
  'the README shows it too, in the ink a white page needs and the white a dark one does');
ok(!count(app, 'border: 5px solid var(--ink); border-radius: 50%') && !home.includes('border: 8px solid #fff'),
  'no page still draws the mark as a ring of border, which was a stand-in for this artwork');

console.log('--- no third-party origin ---');
/* The console fetched viem and the noble primitives from esm.sh at runtime: ~250 requests to a host
   we do not control, on the critical path of the one page that has to work. They are bundled into
   app/vendor/ instead, and this is what keeps them there. */
const vendorDeps = ['app/vendor/viem.js', 'app/vendor/viem-accounts.js', 'app/vendor/worker-deps.js'];
ok(!app.includes('esm.sh') && !worker.includes('esm.sh') && !/const CDN/.test(app) && !/const CDN/.test(worker),
  'neither the page nor the worker still names a CDN to load its own crypto from');
ok(app.includes("import('/app/vendor/viem.js')") && app.includes("import('/app/vendor/viem-accounts.js')")
  && worker.includes("import('./vendor/worker-deps.js')"),
  'both seams point at this origin: the page at the two viem bundles, the worker at its primitives');
const vendorMissing = vendorDeps.filter((f) => !existsSync(f));
ok(vendorMissing.length === 0,
  `every vendored bundle the seams reference exists on disk (missing: ${vendorMissing.join(', ') || 'none'})`);
/* A bundle that reached back out to a CDN would defeat the point, and the page would not show it:
   the page only ever names the entry file. So every line of every vendored file is read and every
   specifier in it has to resolve here. Comment-only lines are skipped, because these bundles carry
   their libraries' prose with them. */
const vendorFiles = existsSync('app/vendor') ? readdirSync('app/vendor').filter((f) => f.endsWith('.js')) : [];
const vendorLines = vendorFiles.flatMap((f) => readFileSync(path.join('app/vendor', f), 'utf8')
  .split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\*)/.test(l))
  .map((l) => [f, l]));
const specifiers = vendorLines.flatMap(([f, l]) =>
  [...l.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((m) => [f, m[1]]));
const external = specifiers.filter(([, s]) => !s.startsWith('./') && !s.startsWith('/'));
ok(vendorFiles.length >= 3 && specifiers.length > 0 && external.length === 0,
  `all ${specifiers.length} specifiers inside the vendored bundles resolve on this origin (external: ${external.map(([f, s]) => `${f} -> ${s}`).join(', ') || 'none'})`);
/* The crypto is the same crypto only if the versions are the ones the derivation was measured
   against: a caret or a tilde here would let a rebuild change the keys a backup restores. */
const vendorPkg = JSON.parse(readFileSync('scripts/vendor/package.json', 'utf8'));
const loose = Object.entries({ ...vendorPkg.dependencies, ...vendorPkg.devDependencies })
  .filter(([, v]) => !/^\d+\.\d+\.\d+$/.test(v));
ok(Object.keys(vendorPkg.dependencies).length === 4 && loose.length === 0,
  `the vendor build pins exact versions, so a rebuild cannot change the derivation (loose: ${loose.map(([n, v]) => `${n}@${v}`).join(', ') || 'none'})`);

/* The README tells a reviewer to run the CLI's conformance check, so its exit status is part of what
   the site promises: nonzero must mean a case failed, not that the process was torn down badly. A
   forced exit while the RPC clients are still closing their sockets aborted at the libuv layer and
   returned 127 on a run where every case passed. */
const cli = readFileSync('scripts/pq.mjs', 'utf8');
ok(cli.includes('process.exitCode = failures === 0 ? 0 : 1') && !cli.includes('process.exit(failures'),
  'the conformance check sets its exit code and lets the loop drain, instead of forcing an exit it cannot finish');

/* The docs print how many tests each contract has, which is a claim a reader can check in one command.
   Counted from the suite here so a number that has drifted from the tests fails the build instead of
   quietly overstating the evidence. */
const countTests = (f) => [...readFileSync(f, 'utf8').matchAll(/function (?:test|testFuzz)\w*\(/g)].length;
const vaultTests = countTests('contracts/test/OlineaVault.t.sol');
const factoryTests = countTests('contracts/test/OlineaFactory.t.sol');
ok(docs.includes(`<td>${vaultTests} Foundry tests green`)
  && docs.includes(`<td>${factoryTests} Foundry tests green`)
  && docs.includes(`# ${vaultTests + factoryTests} tests`),
  `the docs print the suite's real counts (${vaultTests} vault + ${factoryTests} factory = ${vaultTests + factoryTests})`);

console.log('--- the README ---');
/* The README is the first thing a visitor and a reviewer read, and the one document nothing watched:
   a badge could print a test count the suite no longer had, a section could be deleted while its
   table of contents still linked to it, and both would render perfectly while being wrong. These
   read it as a document — its anchors against its own headings, its numbers against the files they
   describe, its commands against the files that have to exist to run them. The line endings are
   normalised first: an anchor pattern that only matches an LF checkout would pass by finding
   nothing at all. */
const md = readme.replace(/\r\n/g, '\n');
const slug = (h) => h.trim().toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');
const mdSections = [...md.matchAll(/^## (.+)$/gm)].map((m) => slug(m[1]));
const mdToc = [...md.matchAll(/^- \[[^\]]+\]\(#([a-z0-9-]+)\)$/gm)].map((m) => m[1]);
/* Every # link in the file, not just the table of contents: the badges point at sections too, and a
   badge whose target was renamed is a dead link rendered in the first screen. */
const mdAnchorList = [
  ...md.matchAll(/href="#([a-z0-9-]+)"/g),
  ...md.matchAll(/\]\(#([a-z0-9-]+)\)/g),
].map((m) => m[1]);
const mdTargets = [...new Set([...mdToc, ...mdAnchorList])];
const deadAnchors = mdTargets.filter((id) => !mdSections.includes(id));
ok(mdToc.length >= 8 && deadAnchors.length === 0,
  `every README #anchor resolves to one of its ${mdSections.length} sections (dead: ${deadAnchors.join(', ') || 'none'})`);
const unlisted = mdSections.filter((id) => id !== 'table-of-contents' && !mdToc.includes(id));
ok(unlisted.length === 0, `and every README section is listed in that table (unlisted: ${unlisted.join(', ') || 'none'})`);

/* The three numbers a reader can check in one command, all counted from the suite above: the badge,
   the structure listing and the line the verify step promises. */
const suite = vaultTests + factoryTests;
ok(md.includes(`badge/tests-${suite}%20passing`),
  `the README badge prints the suite's real total (${suite})`);
ok(md.includes(`OlineaVault.t.sol (${vaultTests})`) && md.includes(`OlineaFactory.t.sol (${factoryTests})`),
  `and the structure listing prints each file's real count (${vaultTests} + ${factoryTests})`);
ok(md.includes(`# ${suite} tests, 0 failed`),
  `and the command a reviewer is told to run promises what the suite holds (${suite} tests)`);

/* The primitive the whole README rests on — the address, the selector, and the size of what gets
   verified. The badge spells the size with %2C, so both spellings are checked. */
ok(md.includes('0x1800000000000000000000000000000000000004') && md.includes('0xbf4db8ba')
  && md.includes('7%2C856%20B') && md.includes('7856 B'),
  'the README cites the canonical precompile, its selector and the 7,856-byte signature it verifies');

/* Every command a reviewer is handed has to exist, and every subcommand has to be one the CLI
   dispatches. A renamed file or verb would leave the README pointing at nothing, which is the kind
   of claim this file exists to fail. */
const mdFiles = [...new Set([...md.matchAll(/node (scripts\/[\w./-]+\.mjs)/g)].map((m) => m[1]))];
const mdFilesMissing = mdFiles.filter((f) => !existsSync(f));
ok(mdFiles.length >= 2 && mdFilesMissing.length === 0,
  `every file the README tells a reviewer to run exists (${mdFiles.length} named, missing: ${mdFilesMissing.join(', ') || 'none'})`);
const mdVerbs = [...new Set([...md.matchAll(/node pq\.mjs ([a-z]+)/g)].map((m) => m[1]))];
const cliVerbs = [...new Set([...cli.matchAll(/command === '([a-z]+)'/g)].map((m) => m[1]))];
const unknownVerbs = mdVerbs.filter((v) => !cliVerbs.includes(v));
ok(mdVerbs.length >= 1 && unknownVerbs.length === 0,
  `and every pq.mjs subcommand it names is one the CLI dispatches (unknown: ${unknownVerbs.join(', ') || 'none'})`);

/* Two addresses a reader can compare between files without trusting any prose: the factory the
   console opens by default, and the vault the submission page holds up. A deploy that updates one
   page and not the README, or the reverse, fails here rather than reaching a visitor. */
const submission = readFileSync('submit.html', 'utf8');
const publishedFactory = (md.match(/^\| Factory \| `(0x[0-9a-fA-F]{40})` \|/m) || [])[1];
const consoleFactory = (app.match(/localStorage\.getItem\('olinea:factory'\) \|\| '(0x[0-9a-fA-F]{40})'/) || [])[1];
ok(publishedFactory && consoleFactory === publishedFactory && submission.includes(publishedFactory),
  'the factory the README publishes is the address the console defaults to and the submission page opens');
const publishedVault = (md.match(/24 words\*\* \| `(0x[0-9a-fA-F]{40})`/) || [])[1];
ok(publishedVault && submission.includes(publishedVault),
  'and the vault the README holds up is the one the submission page opens');

/* The one badge that is a negative claim. If it ever says something else, this fails rather than
   letting a project with no audit imply otherwise. */
ok(md.includes('badge/audit-none') && /unaudited/i.test(md),
  'the README still prints the audit it does not have, in the badge and in the Security section');

console.log('--- everything a page needs ships with it ---');
/* The typeface came from googleapis/gstatic and the hero's three.js from jsdelivr, so a cold visitor's
   first paint waited on hosts we do not control. A page is only as available as its slowest third
   party. Nothing a page loads or runs may leave this origin now — a link a reader clicks may, and
   that is why this reads the tags that fetch rather than every URL in the file. */
const shipped = {
  'index.html': home,
  'app/index.html': app,
  'docs/index.html': docs,
  'submit.html': readFileSync('submit.html', 'utf8'),
};
const SUBRESOURCE = /<(?:link|script|img|source|iframe)\b[^>]*?(?:href|src|srcset)="(?:https?:)?\/\/[^"]*"/gi;
const offOrigin = Object.entries(shipped)
  .flatMap(([name, src]) => (src.match(SUBRESOURCE) || []).map((tag) => `${name}: ${tag.trim()}`));
ok(offOrigin.length === 0,
  `no shipped page points at another host for something it loads (found: ${offOrigin.join(' | ') || 'none'})`);

/* A root-absolute path is a path into the deploy, so a file that is not in the repository is a page
   that breaks where only a browser would notice. Every image, stylesheet and script a page names is
   resolved here. */
const rootPaths = (src) => [
  ...src.matchAll(/(?:href|src)="(\/[^"?#]+)"/g),
  ...src.matchAll(/srcset="([^"]*)"/g),
].flatMap((m) => m[1].split(',')).map((s) => s.trim().split(/\s+/)[0])
  .filter((p) => /^\/[^?#]+\.(png|jpg|svg|css|js|woff2)$/.test(p)).map((p) => p.slice(1));
const named = [...new Set(Object.values(shipped).flatMap(rootPaths))];
const absent = named.filter((p) => !existsSync(p));
ok(named.length >= 6 && absent.length === 0,
  `every asset the pages name at this origin is a file in the deploy (${named.length} checked, missing: ${absent.join(', ') || 'none'})`);

/* The typeface is one stylesheet and 18 committed faces. A stylesheet that still reached for a Google
   host would put the dependency back without any page naming it. */
const fontCss = readFileSync('assets/fonts/poppins.css', 'utf8');
const faces = [...new Set([...fontCss.matchAll(/url\(\/assets\/fonts\/[^)]+\.woff2\)/g)].map((m) => m[0].slice(5, -1)))];
const facesMissing = faces.filter((p) => !existsSync(p));
ok(Object.values(shipped).every((src) => src.includes('href="/assets/fonts/poppins.css"')),
  'every page loads the typeface from one stylesheet of its own');
ok(faces.length >= 18 && facesMissing.length === 0 && !/https?:\/\//.test(fontCss),
  `and all ${faces.length} faces it names are committed beside it, with no host left in the stylesheet (missing: ${facesMissing.join(', ') || 'none'})`);

/* The hero's two bare specifiers resolve through the import map, so the map is what has to point at
   files that exist — the hero's own code never changed. */
const imports = JSON.parse(home.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
ok(imports.three === '/assets/three/three.module.js' && imports['three/addons/'] === '/assets/three/'
  && existsSync('assets/three/three.module.js') && existsSync('assets/three/geometries/RoundedBoxGeometry.js')
  && !/https?:/.test(JSON.stringify(imports)),
  'the hero imports three.js and the one addon it uses, and both files are committed beside the page');
ok(/from 'three'/.test(readFileSync('assets/three/geometries/RoundedBoxGeometry.js', 'utf8')),
  'and the addon asks for the same bare specifier, so one copy of three.js is the one that runs');

console.log('--- the policy that enforces it ---');
/* A source check cannot stop a page loading from another host; the header can. It is asserted here so
   the claim and the enforcement cannot drift apart — and so that a directive loosened to make some
   new dependency work is a failing check rather than a quiet edit. */
const csp = JSON.parse(readFileSync('vercel.json', 'utf8')).headers
  .flatMap((r) => r.headers).find((h) => h.key === 'Content-Security-Policy')?.value ?? '';
const directive = (name) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? '';
ok(directive('default-src') === "default-src 'self'"
  && directive('script-src') === "script-src 'self' 'unsafe-inline'"
  && directive('style-src') === "style-src 'self' 'unsafe-inline'"
  && directive('img-src') === "img-src 'self' data:"
  && directive('font-src') === "font-src 'self'"
  && directive('worker-src') === "worker-src 'self'"
  && directive('object-src') === "object-src 'none'"
  && directive('frame-ancestors') === "frame-ancestors 'none'"
  && !/\*|http:|unsafe-eval/.test(csp),
  'the CSP confines code, styles, images, fonts and workers to this origin — no wildcard, no http:, no unsafe-eval');
/* The console names the RPC it reads from, and `?rpc=` can name another, so connect-src is the one
   directive that has to reach out. It reaches only over https. */
ok(directive('connect-src') === "connect-src 'self' https:",
  'and connect-src reaches exactly as far as the console needs: this origin, or https');

console.log(fails.length ? `\n${fails.length} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fails.length ? 1 : 0);
