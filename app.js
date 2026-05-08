const WHEEL_CONFIG = {
  maxSpeed: 35,        // slots/sec at peak
  spinUpFrames: 25,    // frames to reach max speed
  minSpinSlots: 40,    // minimum slots to travel (not pool loops — fixed time)
  decelFrames: 50,
  MIN_TICK_MS: 60,     // minimum ms between tick sounds
  visibleSlots: 11,    // must be odd
  slotHeight: 34,      // px, matches highlight-band height
};

const DIFF_NAMES = { Beginner: 'Novice', Easy: 'Easy', Medium: 'Medium', Hard: 'Hard', Challenge: 'Expert' };
const mapDiff = name => DIFF_NAMES[name] ?? name;
const ENERGIZER_TITLE = 'Energizer';

// ── State ──
let songs = [];
let tickBuffer = null;
let selectBuffer = null;
let energizerBuffer = null;
let audioCtx = null;

let minDiff = 1;
let maxDiff = 13;
let pool = [];
let redTheme = false;
let energizerSong = null;
let energizerRatings = [];

let wheelPos = 0;
let spinning = false;
let animId = null;
let spinPath = null;
let spinFrame = 0;
let lastTickPos = 0;
let lastTickTime = 0;

// ── DOM ──
const loadingEl      = document.getElementById('loading');
const mainEl         = document.getElementById('main');
const wheelContainer = document.getElementById('wheel-container');
const slotsEl        = document.getElementById('wheel-slots');
const highlightBand = document.getElementById('highlight-band');
const resultTitle = document.getElementById('result-title');
const resultDiff  = document.getElementById('result-diff');
const randomizeBtn = document.getElementById('randomize-btn');
const minValEl    = document.getElementById('min-val');
const maxValEl    = document.getElementById('max-val');
const themeToggle = document.getElementById('theme-toggle');

// ── Boot ──
async function init() {
  const [songsData, tickArr, selectArr, energizerArr] = await Promise.all([
    fetch('songs.json').then(r => r.json()),
    fetch('tick.wav').then(r => r.arrayBuffer()),
    fetch('select.wav').then(r => r.arrayBuffer()),
    fetch('energizer.wav').then(r => r.ok ? r.arrayBuffer() : null).catch(() => null),
  ]);
  songs = songsData;
  window._tickArr = tickArr;
  window._selectArr = selectArr;
  window._energizerArr = energizerArr;

  energizerSong = songs.find(s => s.title === ENERGIZER_TITLE) || null;
  energizerRatings = energizerSong ? energizerSong.difficulties.map(d => d.rating) : [];

  rebuildPool();
  buildSlotElements();

  loadingEl.classList.add('hidden');
  mainEl.classList.remove('hidden');
  // Render after layout is available
  requestAnimationFrame(() => {
    renderWheel();
    randomizeBtn.disabled = false;
  });
}

async function ensureAudio() {
  if (audioCtx) {
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    return;
  }
  audioCtx = new AudioContext();
  [tickBuffer, selectBuffer] = await Promise.all([
    audioCtx.decodeAudioData(window._tickArr.slice(0)),
    audioCtx.decodeAudioData(window._selectArr.slice(0)),
  ]);
  if (window._energizerArr) {
    try {
      energizerBuffer = await audioCtx.decodeAudioData(window._energizerArr.slice(0));
    } catch {}
  }
}

function playSound(buf) {
  if (!buf || !audioCtx) return;
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(audioCtx.destination);
  src.start();
}

// ── Pool ──
function rebuildPool() {
  const filtered = songs.filter(s => s.difficulties.some(d => d.rating >= minDiff && d.rating <= maxDiff));

  const energizerInRange = energizerRatings.some(r => r >= minDiff && r <= maxDiff);
  if (redTheme && energizerSong && energizerInRange) {
    const others = filtered.filter(s => s.title !== ENERGIZER_TITLE);
    if (others.length > 0) {
      const interleaved = [];
      for (const s of others) {
        interleaved.push(s);
        interleaved.push(energizerSong);
      }
      pool = interleaved;
      return;
    }
  }
  pool = filtered;
}

// ── Slot elements ──
const N = WHEEL_CONFIG.visibleSlots;
const slotEls = [];

function buildSlotElements() {
  slotsEl.innerHTML = '';
  slotEls.length = 0;
  for (let i = 0; i < N; i++) {
    const el = document.createElement('div');
    el.className = 'wheel-slot';
    slotsEl.appendChild(el);
    slotEls.push(el);
  }
}

// Cosine-mapped Y position for cylinder illusion
function slotY(trackHeight, d) {
  const half = Math.floor(N / 2);
  const t = d / (half + 0.5); // -1..1
  return Math.sin(t * Math.PI * 0.45) * (trackHeight * 0.36);
}

// Canvas-based text measurement — element scrollWidth can't be used here
// because wheel-slot fills the container width, so scrollWidth always
// equals clientWidth regardless of actual text length.
const measureCtx = document.createElement('canvas').getContext('2d');
function measureTitleWidth(text, fontSizePx) {
  measureCtx.font = `italic bold ${fontSizePx}px Arial, sans-serif`;
  return measureCtx.measureText(text).width;
}

const CENTER_FONT_MAX = 36;
const CENTER_FONT_MIN = 22;

function renderWheel() {
  const trackHeight = slotsEl.offsetHeight || 520;
  const centerY = trackHeight / 2;
  const half = Math.floor(N / 2);
  const len = pool.length;

  for (let i = 0; i < N; i++) {
    const d = i - half;
    const el = slotEls[i];

    if (len === 0) {
      el.textContent = '';
      el.style.opacity = '0';
      continue;
    }

    const poolIdx = ((Math.round(wheelPos) + d) % len + len) % len;
    const song = pool[poolIdx];
    const y = slotY(trackHeight, d);
    const absd = Math.abs(d);
    const scale = Math.max(0.2, 1 - absd * 0.17);
    const opacity = Math.max(0, 1 - absd * 0.2);
    // Power arc: steep drop from center so neighbours quickly veer right
    const xShift = Math.pow(Math.max(0, 1 - absd / half), 2.5) * -75;

    el.textContent = song.title;
    el.style.top = `${centerY + y - WHEEL_CONFIG.slotHeight / 2}px`;
    el.style.height = `${WHEEL_CONFIG.slotHeight}px`;
    el.style.transform = `translateX(${xShift}px) scaleX(${scale}) scaleY(${scale})`;
    el.style.opacity = opacity;
    el.classList.toggle('center-slot', d === 0);

    if (d === 0) {
      // Account for translateX(xShift) and right-padding (22px) — text is
      // right-aligned, so the visible area to the left of its right edge is
      // container width + xShift (negative) − padding.
      const maxWidth = wheelContainer.clientWidth + xShift - 22 - 8;
      let fontSize = CENTER_FONT_MAX;
      while (fontSize > CENTER_FONT_MIN && measureTitleWidth(song.title, fontSize) > maxWidth) {
        fontSize--;
      }
      el.style.fontSize = fontSize + 'px';
    } else {
      el.style.fontSize = '';
    }
  }
}

// ── Spin path ──
function easeOutQuart(t) {
  return 1 - Math.pow(1 - t, 4);
}

function buildSpinPath(startPos, endInt) {
  const { maxSpeed, spinUpFrames, decelFrames } = WHEEL_CONFIG;
  const maxStep = maxSpeed / 60;

  const accelSteps = Array.from({length: spinUpFrames}, (_, f) => maxStep * (f + 1) / spinUpFrames);
  const decelSteps = Array.from({length: decelFrames}, (_, f) =>
    maxStep * (1 - easeOutQuart(f / (decelFrames - 1)))
  );
  const rawDecelDist = decelSteps.reduce((a, b) => a + b, 0);

  const path = [startPos];
  let pos = startPos;

  for (const step of accelSteps) {
    pos += step;
    path.push(pos);
  }

  while (endInt - pos > rawDecelDist + maxStep) {
    pos += maxStep;
    path.push(pos);
  }

  // Scale decel to land exactly on endInt
  const remaining = endInt - pos;
  const scale = remaining / rawDecelDist;
  for (const step of decelSteps) {
    pos += step * scale;
    path.push(pos);
  }

  path[path.length - 1] = endInt;
  return path;
}

// ── Tick ──
function scheduleTick(pos, timestamp) {
  if (Math.floor(pos) > Math.floor(lastTickPos)) {
    if (timestamp - lastTickTime >= WHEEL_CONFIG.MIN_TICK_MS) {
      playSound(tickBuffer);
      lastTickTime = timestamp;
    }
  }
  lastTickPos = pos;
}

// ── Spin ──
async function startSpin() {
  if (spinning || pool.length === 0) return;
  await ensureAudio();

  // Pick random end position: 40-140 extra slots beyond minimum
  const extraSlots = 20 + Math.floor(Math.random() * 100);
  const totalSlots = WHEEL_CONFIG.minSpinSlots + extraSlots;
  const startInt = Math.round(wheelPos);
  const endInt = startInt + totalSlots;
  const targetIdx = ((endInt % pool.length) + pool.length) % pool.length;
  const targetSong = pool[targetIdx];
  const eligible = targetSong.difficulties.filter(d => d.rating >= minDiff && d.rating <= maxDiff);
  const targetDiff = eligible[Math.floor(Math.random() * eligible.length)];

  hideResult();
  spinning = true;
  randomizeBtn.classList.add('spinning');
  randomizeBtn.disabled = true;

  spinPath = buildSpinPath(wheelPos, endInt);
  spinFrame = 0;
  lastTickPos = wheelPos;
  lastTickTime = 0;

  function frame(ts) {
    if (spinFrame >= spinPath.length - 1) {
      wheelPos = endInt;
      renderWheel();
      onLand(targetSong, targetDiff);
      return;
    }
    wheelPos = spinPath[spinFrame];
    scheduleTick(wheelPos, ts);
    renderWheel();
    spinFrame++;
    animId = requestAnimationFrame(frame);
  }

  animId = requestAnimationFrame(frame);
}

function onLand(song, diff) {
  spinning = false;
  randomizeBtn.classList.remove('spinning');
  randomizeBtn.disabled = false;

  const isEnergizer = song.title === ENERGIZER_TITLE;
  playSound(isEnergizer && energizerBuffer ? energizerBuffer : selectBuffer);

  highlightBand.classList.remove('flash');
  void highlightBand.offsetWidth;
  highlightBand.classList.add('flash');

  resultTitle.textContent = song.title;
  resultDiff.textContent = `${mapDiff(diff.name)}  ·  ${diff.rating}`;
  resultTitle.classList.remove('error');
  resultTitle.classList.add('visible');
  resultDiff.classList.add('visible');
}

function hideResult() {
  resultTitle.classList.remove('visible', 'error');
  resultDiff.classList.remove('visible');
}

// ── Steppers ──
function setMin(v) {
  minDiff = Math.max(1, Math.min(v, 13));
  if (minDiff > maxDiff) maxDiff = minDiff;
  minValEl.textContent = minDiff;
  maxValEl.textContent = maxDiff;
  rebuildPool();
  if (!spinning) renderWheel();
}

function setMax(v) {
  maxDiff = Math.max(1, Math.min(v, 13));
  if (maxDiff < minDiff) minDiff = maxDiff;
  minValEl.textContent = minDiff;
  maxValEl.textContent = maxDiff;
  rebuildPool();
  if (!spinning) renderWheel();
}

document.getElementById('min-dec').addEventListener('click', () => setMin(minDiff - 1));
document.getElementById('min-inc').addEventListener('click', () => setMin(minDiff + 1));
document.getElementById('max-dec').addEventListener('click', () => setMax(maxDiff - 1));
document.getElementById('max-inc').addEventListener('click', () => setMax(maxDiff + 1));

randomizeBtn.addEventListener('click', () => {
  if (pool.length === 0) {
    resultTitle.textContent = 'No songs in range';
    resultTitle.classList.add('visible', 'error');
    resultDiff.classList.remove('visible');
    return;
  }
  startSpin();
});

themeToggle.addEventListener('click', () => {
  if (spinning) return;
  redTheme = !redTheme;
  document.body.classList.toggle('red-theme', redTheme);
  themeToggle.textContent = redTheme ? 'Pls no Energizer!' : 'Energizer?';
  rebuildPool();
  renderWheel();
});

window.addEventListener('resize', () => { if (!spinning) renderWheel(); });

init().catch(console.error);
