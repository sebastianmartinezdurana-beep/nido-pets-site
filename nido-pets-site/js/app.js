'use strict';
/* ================================================================
   NIDO PETS — Scroll-Driven Engine
   Stack  : Lenis (smooth scroll) + GSAP (animations) + Canvas
   Video  : 4727-179738642_medium.mp4 → 238 WebP frames at 15fps
   ================================================================ */

const FRAME_COUNT = 151;
const FRAME_PATH  = 'frames/frame_{n}.jpg';

/* ── DOM ─────────────────────────────────────────────────────────── */
const $loader       = document.getElementById('loader');
const $loaderBar    = document.getElementById('loader-bar');
const $loaderPct    = document.getElementById('loader-percent');
const $canvas       = document.getElementById('canvas');
const $overlay      = document.getElementById('dark-overlay');
const $scrollWrap   = document.getElementById('scroll-container');
const $hero         = document.getElementById('hero');
const $marqueeTrack = document.querySelector('.marquee-track');
const $marqueeText  = document.querySelector('.marquee-text');
const $progressBar  = document.getElementById('scroll-progress-bar');
const $bgZone       = document.getElementById('bg-zone');
const $zoneGlow     = document.getElementById('zone-glow');
const ctx           = $canvas.getContext('2d');

/* ── State ──────────────────────────────────────────────────────── */
const frames  = new Array(FRAME_COUNT).fill(null);
let   curFI   = 0;
let   lenis;
let   rafId;

/* ── Color zones ────────────────────────────────────────────────── */
/*   Each zone fires when contProg reaches its `at` threshold.
     bg   = page / bg-zone background color
     fill = canvas letterbox fill (matches bg for seamless blend)
     glow = [r, g, b, alpha] for the radial bloom on the left panel */
const COLOR_ZONES = [
  { at: 0,    bg: '#080806', fill: '#080806', glow: [  0,  0,  0, 0    ] }, // neutral onyx
  { at: 0.01, bg: '#05050F', fill: '#05050F', glow: [ 20, 28, 115, 0.17] }, // S01 — cold midnight
  { at: 0.22, bg: '#051109', fill: '#051109', glow: [ 14, 100, 40, 0.17] }, // S02 — forest emerald
  { at: 0.43, bg: '#170E05', fill: '#170E05', glow: [155,  95, 18, 0.19] }, // S03 — amber ember
  { at: 0.64, bg: '#06100A', fill: '#06100A', glow: [ 12,  88, 36, 0.17] }, // S04 — deep forest
  { at: 0.76, bg: '#140D05', fill: '#140D05', glow: [150, 110, 25, 0.21] }, // S05 — warm gold
];

let currentZone = -1;
let zoneCanvasBg = '#080806';

/* Proxy object for smooth glow color interpolation via GSAP */
const glowProxy = { r: 0, g: 0, b: 0, a: 0 };

function getZoneIndex(cp) {
  let z = 0;
  for (let i = 1; i < COLOR_ZONES.length; i++) {
    if (cp >= COLOR_ZONES[i].at) z = i;
  }
  return z;
}

function applyZone(idx) {
  const zone = COLOR_ZONES[idx];

  /* 1 — Background color */
  gsap.to($bgZone, {
    backgroundColor: zone.bg,
    duration: 1.2,
    ease: 'power2.inOut',
    overwrite: 'auto',
  });

  /* 2 — Canvas fill (instant — letterbox areas are small) */
  zoneCanvasBg = zone.fill;

  /* 3 — Radial glow bloom on left panel */
  gsap.to(glowProxy, {
    r: zone.glow[0],
    g: zone.glow[1],
    b: zone.glow[2],
    a: zone.glow[3],
    duration: 1.4,
    ease: 'power2.inOut',
    overwrite: 'auto',
    onUpdate() {
      const { r, g, b, a } = glowProxy;
      $zoneGlow.style.background =
        `radial-gradient(ellipse 100% 70% at 38% 52%, ` +
        `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a.toFixed(3)}) 0%, ` +
        `transparent 65%)`;
    },
  });
}

/* ── Helpers ────────────────────────────────────────────────────── */
const pad4   = n => String(n).padStart(4, '0');
const frameSrc = i => FRAME_PATH.replace('{n}', pad4(i + 1));
const clamp    = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ── Canvas: resize to its actual rendered size ──────────────────── */
function resizeCanvas() {
  $canvas.width  = $canvas.offsetWidth  || window.innerWidth * 0.52;
  $canvas.height = $canvas.offsetHeight || window.innerHeight;
  drawFrame(curFI);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ── Canvas: CONTAIN mode — full dog always visible ─────────────── */
const NAV_H = 80; // keep dog below the fixed nav bar

function drawFrame(i) {
  const img = frames[i];
  if (!img) return;
  const cw = $canvas.width, ch = $canvas.height;
  const iw = img.naturalWidth  || 960;
  const ih = img.naturalHeight || 960;
  /* Draw inside the area below the nav so the head is never hidden */
  const drawH = ch - NAV_H;
  const s  = Math.min(cw / iw, drawH / ih);
  const dx = (cw - iw * s) / 2;
  const dy = NAV_H + (drawH - ih * s) / 2;
  ctx.fillStyle = zoneCanvasBg;
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, dx, dy, iw * s, ih * s);
}

/* ── Load single frame ──────────────────────────────────────────── */
const loadFrame = i => new Promise(res => {
  if (frames[i]) { res(); return; }
  const img    = new Image();
  img.onload   = () => { frames[i] = img; res(); };
  img.onerror  = () => res();
  img.src      = frameSrc(i);
});

/* ── Boot: Phase 1 (show frame 0 instantly) ─────────────────────── */
async function boot() {
  /* Entrance animation for loader logo — scale only (no opacity) so
     mix-blend-mode: screen keeps compositing against the dark loader bg */
  const $loaderLogo = document.querySelector('.loader-logo');
  if ($loaderLogo) {
    gsap.fromTo($loaderLogo,
      { scale: 0.88 },
      { scale: 1, duration: 0.75, delay: 0.1, ease: 'power3.out' }
    );
  }

  await loadFrame(0);
  drawFrame(0);

  /* Phase 2: load all frames, update loader */
  let done = 1;
  const batchSz = 10;

  for (let i = 1; i < FRAME_COUNT; i += batchSz) {
    const batch = [];
    for (let j = i; j < Math.min(i + batchSz, FRAME_COUNT); j++) {
      batch.push(loadFrame(j));
    }
    await Promise.all(batch);
    done += batch.length;

    const pct = clamp(Math.round(done / FRAME_COUNT * 100), 0, 100);
    if ($loaderBar)  $loaderBar.style.width = pct + '%';
    if ($loaderPct)  $loaderPct.textContent = pct + '%';
  }

  /* All loaded → fade loader → start experience */
  gsap.to($loader, {
    opacity: 0,
    duration: 0.9,
    ease: 'power2.inOut',
    onComplete() {
      $loader.style.display = 'none';
      launch();
    }
  });
}

/* ── Marquee: infinite scroll ───────────────────────────────────── */
function initMarquee() {
  if (!$marqueeText) return;
  // Duplicate 4× for seamless wrap
  const orig = $marqueeText.textContent;
  $marqueeText.textContent = orig.repeat(4);
  const clone = $marqueeText.cloneNode(true);
  $marqueeTrack.appendChild(clone);

  const tw = $marqueeText.scrollWidth;
  gsap.set([$marqueeText, clone], { x: 0 });

  gsap.to($marqueeText, {
    x: -tw / 2, duration: 30, ease: 'none', repeat: -1,
    modifiers: { x: gsap.utils.unitize(x => parseFloat(x) % (tw / 2)) }
  });
  gsap.to(clone, {
    x: -tw / 2, duration: 30, ease: 'none', repeat: -1,
    delay: -15,
    modifiers: { x: gsap.utils.unitize(x => parseFloat(x) % (tw / 2)) }
  });
}

/* ── Section animation system ───────────────────────────────────── */
const sections    = [...document.querySelectorAll('.scroll-section')];
const secState    = new Map();   // section → boolean (currently shown)
const counterDone = new Set();   // sections where counters already ran

const TEXT_SELS = '.section-eyebrow, .section-heading, .section-body, .section-rule, .section-detail, .cta-button';

function textEls(inner) { return [...inner.querySelectorAll(TEXT_SELS)]; }

function initSections() {
  sections.forEach(sec => {
    gsap.set(sec, { opacity: 0 });
    secState.set(sec, false);

    const anim  = sec.dataset.animation;
    const inner = sec.querySelector('.section-inner') || sec.querySelector('.stats-row');
    if (!inner) return;

    switch (anim) {
      case 'slide-left':
        gsap.set(inner, { x: -55 });
        gsap.set(textEls(inner), { y: 20, opacity: 0 });
        break;
      case 'slide-right':
        gsap.set(inner, { x: 55 });
        gsap.set(textEls(inner), { y: 20, opacity: 0 });
        break;
      case 'scale-up':
        gsap.set(inner, { scale: 0.90 });
        gsap.set(textEls(inner), { y: 20, opacity: 0 });
        break;
      case 'clip-reveal':
        gsap.set(inner, { clipPath: 'inset(0 100% 0 0)' });
        break;
      case 'stagger-up':
        gsap.set(sec.querySelectorAll('.stat'), { y: 45, opacity: 0 });
        break;
    }
  });
}

function showSection(sec) {
  sec.classList.add('is-visible');
  sec.style.zIndex = '12'; // lift above all inactive sections (z-index: 10)
  gsap.to(sec, { opacity: 1, duration: 0.35, ease: 'power2.out' });

  const anim  = sec.dataset.animation;
  const inner = sec.querySelector('.section-inner') || sec.querySelector('.stats-row');
  if (!inner) return;

  const els = textEls(inner);

  switch (anim) {
    case 'slide-left':
    case 'slide-right':
      gsap.to(inner, { x: 0, duration: 0.65, ease: 'power3.out' });
      gsap.to(els, { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out', stagger: 0.08, delay: 0.10 });
      break;
    case 'scale-up':
      gsap.to(inner, { scale: 1, duration: 0.65, ease: 'power3.out' });
      gsap.to(els, { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out', stagger: 0.08, delay: 0.10 });
      break;
    case 'clip-reveal':
      gsap.to(inner, { clipPath: 'inset(0 0% 0 0)', duration: 0.90, ease: 'power3.inOut', delay: 0.04 });
      break;
    case 'stagger-up':
      gsap.to(sec.querySelectorAll('.stat'), {
        y: 0, opacity: 1, duration: 0.60, ease: 'power3.out', stagger: 0.13, delay: 0.06,
      });
      if (!counterDone.has(sec)) { counterDone.add(sec); animateCounters(sec); }
      break;
  }
}

function hideSection(sec) {
  sec.classList.remove('is-visible');
  sec.style.zIndex = ''; // return to CSS z-index: 10
  gsap.to(sec, { opacity: 0, duration: 0.28, ease: 'power2.in' });

  const anim  = sec.dataset.animation;
  const inner = sec.querySelector('.section-inner') || sec.querySelector('.stats-row');
  if (!inner) return;

  switch (anim) {
    case 'slide-left':
      gsap.set(inner, { x: -55 });
      gsap.set(textEls(inner), { y: 20, opacity: 0 });
      break;
    case 'slide-right':
      gsap.set(inner, { x: 55 });
      gsap.set(textEls(inner), { y: 20, opacity: 0 });
      break;
    case 'scale-up':
      gsap.set(inner, { scale: 0.90 });
      gsap.set(textEls(inner), { y: 20, opacity: 0 });
      break;
    case 'clip-reveal':
      gsap.set(inner, { clipPath: 'inset(0 100% 0 0)' });
      break;
    case 'stagger-up':
      gsap.set(sec.querySelectorAll('.stat'), { y: 45, opacity: 0 });
      counterDone.delete(sec);
      break;
  }
}

/* ── Counter animations ─────────────────────────────────────────── */
function animateCounters(sec) {
  sec.querySelectorAll('[data-value]').forEach(el => {
    const target = parseFloat(el.dataset.value);
    const dec    = parseInt(el.dataset.decimals || '0');
    const proxy  = { v: 0 };
    gsap.to(proxy, {
      v: target,
      duration: 1.6,
      ease: 'power2.out',
      delay: 0.2,
      onUpdate() { el.textContent = proxy.v.toFixed(dec); },
    });
  });
}

/* ── Main scroll handler ────────────────────────────────────────── */
function onScroll(scrollY) {
  const heroH    = $hero.offsetHeight;              // ~100vh
  const contTop  = $scrollWrap.offsetTop;           // starts after hero
  const contH    = $scrollWrap.offsetHeight;

  /* 1 — Scroll progress bar (entire page) */
  const totalScroll = document.body.scrollHeight - window.innerHeight;
  const pageProgress = totalScroll > 0 ? scrollY / totalScroll : 0;
  if ($progressBar) $progressBar.style.width = (pageProgress * 100) + '%';

  /* 1b — Nav: transparent at top, solid after scrolling */
  const $header = document.getElementById('site-header');
  if ($header) $header.classList.toggle('is-scrolled', scrollY > 60);

  /* 2 — Container progress (0→1 during pinned section) */
  const contProg = clamp((scrollY - contTop) / contH, 0, 1);

  /* 3 — Frame selection */
  const fi = clamp(Math.floor(contProg * FRAME_COUNT), 0, FRAME_COUNT - 1);
  if (fi !== curFI) { curFI = fi; drawFrame(fi); }

  /* 3b — Color zone atmosphere */
  const zoneIdx = getZoneIndex(contProg);
  if (zoneIdx !== currentZone) {
    currentZone = zoneIdx;
    applyZone(zoneIdx);
  }

  /* 4 — Hero exit: stays fully visible until 70% of its scroll height,
          then fades and slides up quickly over the last 25% */
  const heroProg  = clamp(scrollY / heroH, 0, 1);
  const heroFade  = Math.max(0, (heroProg - 0.70) / 0.25);
  $hero.style.opacity        = String(Math.max(0, 1 - heroFade));
  $hero.style.transform      = `translateY(${-heroFade * 55}px)`;
  $hero.style.pointerEvents  = heroProg >= 0.92 ? 'none' : '';

  /* 5 — Dark overlay: light touch — video already has black bg */
  const oAlpha = clamp(contProg * 1.0, 0, 0.55);
  $overlay.style.opacity = String(oAlpha);

  /* 6 — Section show / hide */
  sections.forEach(sec => {
    const enter  = parseFloat(sec.dataset.enter) / 100;
    const leave  = parseFloat(sec.dataset.leave) / 100;
    const persist = sec.dataset.persist === 'true';
    const should  = contProg >= enter && (contProg < leave || persist);

    if (should !== secState.get(sec)) {
      secState.set(sec, should);
      should ? showSection(sec) : hideSection(sec);
    }
  });
}

/* ── Launch (after loader hides) ────────────────────────────────── */
function launch() {
  /* Scroll container height drives the pinned experience.
     7 × viewport = generous scroll time through all sections. */
  $scrollWrap.style.height = (window.innerHeight * 6) + 'px';

  initSections();
  initMarquee();

  lenis = new Lenis({ lerp: 0.11, smoothWheel: true });

  lenis.on('scroll', ({ scroll }) => onScroll(scroll));

  function raf(t) { lenis.raf(t); rafId = requestAnimationFrame(raf); }
  rafId = requestAnimationFrame(raf);

  onScroll(0); // set initial state
}

/* ── Post-scroll section entrance animations ────────────────────── */
function initPostScrollAnimations() {
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  document.querySelectorAll('.step-card, .pricing-card, .feature-item')
    .forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(28px)';
      el.style.transition = 'opacity 0.65s ease, transform 0.65s ease';
      observer.observe(el);
    });

  /* When in-view class is added, trigger transition via CSS */
  document.addEventListener('transitionend', () => {}, { passive: true });
}

/* Stagger in-view for observed elements */
const styleSheet = document.createElement('style');
styleSheet.textContent = `
  .step-card.in-view,
  .pricing-card.in-view,
  .feature-item.in-view,
  .testimonial-card.in-view {
    opacity: 1 !important;
    transform: none !important;
  }
  .step-card:nth-child(2).in-view { transition-delay: 0.10s !important; }
  .step-card:nth-child(3).in-view { transition-delay: 0.20s !important; }
  .feature-item:nth-child(2).in-view { transition-delay: 0.08s !important; }
  .feature-item:nth-child(3).in-view { transition-delay: 0.16s !important; }
  .feature-item:nth-child(4).in-view { transition-delay: 0.24s !important; }
`;
document.head.appendChild(styleSheet);

/* ── Hero mouse parallax ────────────────────────────────────────── */
function initHeroParallax() {
  const heading = $hero.querySelector('.hero-heading');
  const label   = $hero.querySelector('.hero-label');
  const tagline = $hero.querySelector('.hero-tagline');
  const cta     = $hero.querySelector('.hero-cta-btn');
  if (!heading) return;

  document.addEventListener('mousemove', e => {
    if (parseFloat($hero.style.opacity || '1') < 0.15) return;
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx; // -1 → 1
    const dy = (e.clientY - cy) / cy;

    gsap.to(heading, { x: dx * 10, y: dy * 5,  duration: 1.4, ease: 'power2.out', overwrite: 'auto' });
    gsap.to(label,   { x: dx * 6,  y: dy * 3,  duration: 1.4, ease: 'power2.out', overwrite: 'auto' });
    gsap.to(tagline, { x: dx * 7,  y: dy * 3.5,duration: 1.4, ease: 'power2.out', overwrite: 'auto' });
    gsap.to(cta,     { x: dx * 4,  y: dy * 2,  duration: 1.4, ease: 'power2.out', overwrite: 'auto' });
  });
}

/* ── Magnetic buttons ───────────────────────────────────────────── */
function initMagneticButtons() {
  document.querySelectorAll('.hero-cta-btn, .cta-button').forEach(btn => {
    btn.addEventListener('mousemove', e => {
      const r  = btn.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width  / 2)) * 0.28;
      const dy = (e.clientY - (r.top  + r.height / 2)) * 0.28;
      gsap.to(btn, { x: dx, y: dy, duration: 0.5, ease: 'power2.out', overwrite: 'auto' });
    });
    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, { x: 0, y: 0, duration: 0.75, ease: 'elastic.out(1, 0.45)', overwrite: 'auto' });
    });
  });
}

/* ── Testimonials carousel ──────────────────────────────────────── */
function initTestimonialsCarousel() {
  const stage    = document.getElementById('testimonials-stage');
  const dotsWrap = document.getElementById('testimonials-dots');
  if (!stage || !dotsWrap) return;

  const items = [...stage.querySelectorAll('.testimonial-item')];
  if (items.length === 0) return;

  let current = 0;
  let timer;
  const dots = [];

  /* Measure tallest item to set stage min-height */
  items.forEach(item => {
    item.style.position = 'relative';
    item.style.opacity  = '1';
  });
  stage.style.minHeight = stage.offsetHeight + 'px';
  items.forEach(item => {
    item.style.position = '';
    item.style.opacity  = '';
  });

  /* Create dot buttons */
  items.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className   = 'testimonials-dot';
    dot.setAttribute('aria-label', 'Testimonio ' + (i + 1));
    dot.addEventListener('click', () => goTo(i));
    dotsWrap.appendChild(dot);
    dots.push(dot);
  });

  function goTo(n) {
    items[current].classList.remove('is-active');
    dots[current].classList.remove('is-active');
    current = (n + items.length) % items.length;
    items[current].classList.add('is-active');
    dots[current].classList.add('is-active');
    resetTimer();
  }

  function resetTimer() {
    clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), 5000);
  }

  goTo(0);
}

/* ── Mobile hamburger menu ──────────────────────────────────────── */
function initHamburger() {
  const btn  = document.getElementById('nav-hamburger');
  const menu = document.getElementById('nav-links');
  if (!btn || !menu) return;

  function openMenu() {
    menu.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    menu.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', () =>
    menu.classList.contains('is-open') ? closeMenu() : openMenu()
  );

  menu.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', closeMenu)
  );

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });
}

/* ── Custom cursor ──────────────────────────────────────────────── */
function initCursor() {
  if (window.matchMedia('(pointer: coarse)').matches) return;
  const dot  = document.getElementById('cursor-dot');
  const ring = document.getElementById('cursor-ring');
  if (!dot || !ring) return;

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let rx = mx, ry = my;

  document.addEventListener('mousemove', e => {
    mx = e.clientX; my = e.clientY;
    dot.style.left = mx + 'px';
    dot.style.top  = my + 'px';
  });

  document.addEventListener('mousedown', () => dot.classList.add('is-clicking'));
  document.addEventListener('mouseup',   () => dot.classList.remove('is-clicking'));

  document.querySelectorAll('a, button, .cta-button, .nav-cta').forEach(el => {
    el.addEventListener('mouseenter', () => ring.classList.add('is-hovering'));
    el.addEventListener('mouseleave', () => ring.classList.remove('is-hovering'));
  });

  (function tick() {
    rx += (mx - rx) * 0.13;
    ry += (my - ry) * 0.13;
    ring.style.left = rx + 'px';
    ring.style.top  = ry + 'px';
    requestAnimationFrame(tick);
  })();
}

/* ── Go ─────────────────────────────────────────────────────────── */
initHamburger();
initCursor();
initHeroParallax();
initMagneticButtons();
initPostScrollAnimations();
initTestimonialsCarousel();
boot();
