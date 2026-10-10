/*
 * The release path, drawn — the strip between the three claims and "How it works".
 *
 * A vault on the left, a gate in the middle (Arc's precompile) and a stream of signature bytes that
 * crosses from one to the other. Each cycle the stream reaches the gate, the gate flashes, and only
 * then does a coin leave the vault and travel out. The drawing is not decoration with a caption
 * bolted on: it happens in the order the page claims it does.
 *
 * Everything here is procedural geometry from the three.js already committed beside this page — no
 * model file, no host, nothing to wait for. It renders only while it is on screen, and a visitor who
 * asked their OS for less motion gets one composed frame instead of a loop.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const canvas = document.getElementById('flow');

if (canvas) {
  /* The palette is read back out of the cascade, exactly like the hero, so light mode and dark mode
     are one stylesheet away and there is no second set of colours to keep in step. */
  const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback);
  const hexOf = (v) => { const h = v.replace('#', ''); const s = h.length === 3 ? h[0] + h[0] + h[1] + h[1] + h[2] + h[2] : h; return parseInt(s, 16); };
  const INK = hexOf(css('--script-ink', '#e9e9e9'));
  const ACCENT = hexOf(css('--accent', '#6ee7b7'));

  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (err) {
    /* No WebGL: the strip becomes the sentence it always was, and the caption still reads. */
    canvas.hidden = true;
  }

  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearAlpha(0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 60);
    camera.position.set(0.1, 0.32, 5);

    /* ------------------------------------------------ geometry: vault, gate, path */

    /* One path, used by both the stream and the coin that leaves, so the two can never disagree
       about where the gate is. getPoint() lands exactly on control point i at t = i / (n - 1). */
    const PATH = [
      new THREE.Vector3(-2.05, 0.02, 0.2), // resting on the stack, inside the vault
      new THREE.Vector3(-1.45, 0.14, 0.22),
      new THREE.Vector3(-0.75, 0.03, 0.1),
      new THREE.Vector3(-0.1, -0.02, 0.03),
      new THREE.Vector3(0.5, 0.0, 0.0), // the gate
      new THREE.Vector3(1.15, 0.12, -0.03),
      new THREE.Vector3(1.9, 0.3, -0.1),
      new THREE.Vector3(2.6, 0.5, -0.18),
    ];
    const GATE_T = 4 / (PATH.length - 1);
    const path = new THREE.CatmullRomCurve3(PATH);
    const VAULT_X = -2.05;
    const GATE_X = 0.5;

    /* Vault: a rounded shell you can see into, with its edges drawn so it reads as a container. */
    const vault = new THREE.Group();
    vault.position.set(VAULT_X, 0.02, 0);
    const shellGeo = new RoundedBoxGeometry(1.5, 1.5, 1.5, 4, 0.14);
    /* Glass, not a lid: at 0.94 the resting coins were inside a black box and the “coin leaves the
       vault” beat was invisible. You have to be able to see what is being protected. */
    const shell = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({
      color: hexOf(css('--panel', '#0d0f14')), metalness: 0.35, roughness: 0.6, transparent: true, opacity: 0.4,
      depthWrite: false,
    }));
    /* Order, not opacity, is what makes the vault transparent. A transparent material still writes
       depth by default, and three.js sorts whole objects by distance — so the shell was drawn
       before the coins, its front pane claimed every pixel in the vault, and the coins behind it
       were depth-rejected. The interior rendered as a flat wash with nothing in it. Not writing
       depth and drawing after the coins is what actually puts them behind glass. */
    shell.renderOrder = 2;
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(shellGeo),
      new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.26 }),
    );
    edges.renderOrder = 3;
    vault.add(shell, edges);
    scene.add(vault);

    /* Coins: three resting in the vault and the one that is going to leave, on top of them. */
    const coinGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.09, 48);
    const coinMat = () => new THREE.MeshStandardMaterial({
      color: ACCENT, emissive: ACCENT, emissiveIntensity: 1.15,
      metalness: 0.2, roughness: 0.45, transparent: true, opacity: 1,
    });
    /* Slightly towards the camera, so the shell is a pane in front of them rather than a wall. */
    for (let i = 0; i < 3; i++) {
      const coin = new THREE.Mesh(coinGeo, coinMat());
      coin.position.set(VAULT_X, -0.06 - i * 0.09, 0.2);
      coin.renderOrder = 1;
      scene.add(coin);
    }
    const traveller = new THREE.Mesh(coinGeo, coinMat());
    traveller.position.copy(path.getPoint(0));
    traveller.renderOrder = 1;
    scene.add(traveller);
    /* Measured, not guessed: at metalness 0.75 a coin with no environment map renders nearly black,
       and half of the little light left is eaten by the shell. Sampled through the glass it had a
       green dominance of 10 out of 255 — a tint, not a coin. Emissive at 1.15 over a low-metalness
       surface is what makes them read as coins you can see being protected. */

    /* Gate: two rings and the faint disc between them — the thing a release has to pass. */
    const gate = new THREE.Group();
    gate.position.set(GATE_X, 0.0, 0);
    const ringOuter = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, 0.014, 12, 128),
      new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.4 }),
    );
    const ringInner = new THREE.Mesh(
      new THREE.TorusGeometry(0.8, 0.006, 10, 128),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.35 }),
    );
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(0.79, 64),
      new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.045, side: THREE.DoubleSide, depthWrite: false }),
    );
    gate.add(ringOuter, ringInner, disc);
    scene.add(gate);

    /* Stream: points riding the same path, evenly staggered. Colour is per-vertex, flipped from ink
       to accent the moment a point is past the gate — the same one-way door the contract enforces. */
    const N = 420;
    const stream = new THREE.Points(
      new THREE.BufferGeometry()
        .setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
        .setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3)),
      new THREE.PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true }),
    );
    scene.add(stream);

    /* Lights: the page's own ink for the room, the accent sitting inside the gate. */
    scene.add(new THREE.AmbientLight(INK, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(-3, 4.5, 5);
    scene.add(key);
    const gateLight = new THREE.PointLight(ACCENT, 26, 9, 2);
    gateLight.position.set(GATE_X, 0, 0.5);
    scene.add(gateLight);

    const inkC = new THREE.Color(INK);
    const accentC = new THREE.Color(ACCENT);

    /* --------------------------------------------------------------- the cycle */

    /* One cycle: the coin rests, leaves, is verified at the gate, is on its way. The flash is a
       function of the cycle phase, so the coin and the gate can never drift apart. */
    const PERIOD = 9.6;    // seconds per release
    const DEPART = 0.08;   // phase the coin lifts off the stack
    const ARRIVE = 0.78;   // phase it has faded out at the far end

    const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
    /* Solve the easing backwards, so the flash peaks at the phase where the coin is actually at the
       gate instead of wherever 0.52 happened to land. At the old fixed 0.52 the coin was already
       half a unit past the ring when the gate pulsed — the drawing claiming the gate answers after
       the fact. Derived from GATE_T and the same curve the coin rides, it cannot drift again. */
    const smoothInv = (y) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (smooth(m) < y) lo = m; else hi = m; }
      return (lo + hi) / 2;
    };
    const FLASH = DEPART + (ARRIVE - DEPART) * smoothInv(GATE_T); // the coin on the gate

    function draw(phase) {
      const p = phase - Math.floor(phase);
      const flash = Math.max(0, 1 - Math.abs(p - FLASH) / 0.07);
      const travel = smooth((p - DEPART) / (ARRIVE - DEPART));

      /* The stream never stops; it is the vault being read, not an event in itself. */
      const pos = stream.geometry.attributes.position.array;
      const col = stream.geometry.attributes.color.array;
      for (let i = 0; i < N; i++) {
        const t = (i / N + phase * 0.55) % 1;
        const point = path.getPoint(t);
        pos[i * 3] = point.x;
        pos[i * 3 + 1] = point.y + Math.sin((t + phase) * 12 + i) * 0.012;
        pos[i * 3 + 2] = point.z;
        const beyond = t > GATE_T;
        const src = beyond ? accentC : inkC;
        const glow = beyond ? 1 : 0.34;
        col[i * 3] = src.r * glow;
        col[i * 3 + 1] = src.g * glow;
        col[i * 3 + 2] = src.b * glow;
      }
      stream.geometry.attributes.position.needsUpdate = true;
      stream.geometry.attributes.color.needsUpdate = true;

      /* The coin: resting, then along the path, then gone past the far end. */
      const at = path.getPoint(travel);
      traveller.position.set(at.x, at.y, at.z);
      traveller.rotation.y += 0.04;
      traveller.material.opacity = p > 0.66 ? Math.max(0, 1 - (p - 0.66) / (ARRIVE - 0.66)) : 1;
      traveller.visible = p < ARRIVE || p < DEPART;

      /* The gate answers when the coin is at it — a short, unmistakable pulse. */
      ringOuter.material.emissiveIntensity = 0.5 + 3.4 * flash;
      disc.material.opacity = 0.045 + 0.16 * flash;
      gateLight.intensity = 26 + 120 * flash;
      gate.scale.setScalar(1 + 0.035 * flash);

      /* Idle: the strip breathes a little, so a still frame never looks like a broken image. */
      scene.rotation.y = Math.sin(phase * 0.35) * 0.05;
      vault.position.y = 0.02 + Math.sin(phase * 0.6) * 0.02;

      renderer.render(scene, camera);
    }

    /* -------------------------------------------------------------------- sizing */

    /* Fit the whole strip: the scene is about 5.6 units wide and 2.2 tall, and the canvas is a short
       wide box, so the vertical extent decides the distance on a phone and the horizontal on desktop. */
    function fit() {
      const w = Math.max(1, canvas.clientWidth);
      const h = Math.max(1, canvas.clientHeight);
      const aspect = w / h;
      renderer.setSize(w, h, false);
      camera.aspect = aspect;
      const half = Math.tan((camera.fov / 2) * (Math.PI / 180));
      camera.position.z = Math.max(4.9, 3.5 / (half * aspect));
      camera.lookAt(0.1, -0.02, 0);
      camera.updateProjectionMatrix();
    }

    /* -------------------------------------------------------------------- motion */

    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let running = false;
    let visible = false;
    let raf = 0;
    let start = 0;

    function frame(now) {
      if (!running) return;
      if (!start) start = now;
      if (visible) draw((now - start) / 1000 / PERIOD);
      raf = requestAnimationFrame(frame);
    }

    const play = () => { if (!running) { running = true; start = 0; raf = requestAnimationFrame(frame); } };
    const pause = () => { running = false; cancelAnimationFrame(raf); };

    fit();
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => { fit(); if (!running) draw(FLASH); }).observe(canvas);
    } else {
      window.addEventListener('resize', () => { fit(); if (!running) draw(FLASH); });
    }

    /* A page scrolls; a loop nobody is looking at is just battery. */
    if (reduced) {
      draw(FLASH); // one frame, mid-release, so the strip still tells the story
    } else if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
        if (visible) play(); else pause();
      }, { rootMargin: '120px' }).observe(canvas);
    } else {
      visible = true;
      play();
    }

    /* Pointer parallax, desktop only: the strip leans a little towards the reader. */
    if (!reduced && matchMedia('(pointer: fine)').matches) {
      let tx = 0;
      let ty = 0;
      window.addEventListener('pointermove', (e) => {
        tx = (e.clientX / window.innerWidth - 0.5) * 0.5;
        ty = (e.clientY / window.innerHeight - 0.5) * 0.25;
      }, { passive: true });
      const lean = () => {
        camera.position.x += (0.1 + tx - camera.position.x) * 0.04;
        camera.position.y += (0.32 + ty - camera.position.y) * 0.04;
        camera.lookAt(0.1, -0.02, 0);
        requestAnimationFrame(lean);
      };
      lean();
    }
  }
}
