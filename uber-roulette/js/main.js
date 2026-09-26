import { pick } from './fair.js?v=3';
import { sfx, unlock, isMuted, setMuted } from './audio.js?v=3';
import { showResult, hideResult } from './result.js?v=3';
import { esc } from './stage.js?v=3';
import marble from './modes/marble.js?v=3';
import fling from './modes/fling.js?v=3';
import wheel from './modes/wheel.js?v=3';
import beer from './modes/beer.js?v=3';

const MODES = [marble, fling, wheel, beer];
const RANDOM = { id: 'random', title: 'Surprise me', emoji: '🎲', blurb: 'Pick one of the games at random.' };
const KEY = 'uber-roulette:roster';
const MAX_PLAYERS = 16;
const PALETTE = ['#ff4d6d', '#ffb703', '#3de0ff', '#7ae582', '#b388ff', '#ff8c42', '#4d8bff', '#ff6bd5', '#2ec4b6', '#e9ff70', '#d4a373', '#f1f1f1'];

const $ = id => document.getElementById(id);
const home = $('home');
const game = $('game');
const canvas = $('canvas');
const hud = $('hud');
const rosterEl = $('roster');
const input = $('add-name');
const addError = $('add-error');

// ---------- Roster ----------

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(data)) return data.filter(p => p && typeof p.name === 'string' && p.name.trim());
  } catch { /* storage blocked or corrupt */ }
  return [];
}

let roster = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(roster)); } catch { /* ignore */ }
}

const going = () => roster.filter(p => p.going);

function nextColor() {
  const used = new Set(roster.map(p => p.color));
  return PALETTE.find(c => !used.has(c)) ?? PALETTE[roster.length % PALETTE.length];
}

function renderRoster() {
  rosterEl.innerHTML = roster.length
    ? roster.map((p, i) => `
      <li class="chip${p.going ? '' : ' out'}" style="--c:${p.color}">
        <button type="button" class="toggle" data-i="${i}" aria-pressed="${p.going}">
          <span class="dot"></span><span class="name">${esc(p.name)}</span>
        </button>
        <button type="button" class="x" data-remove="${i}" aria-label="Remove ${esc(p.name)}">×</button>
      </li>`).join('')
    : '<li class="empty">No one yet. Add your roommates above.</li>';

  const n = going().length;
  $('going-count').textContent = `${n} going`;
  $('play-hint').textContent = n < 2 ? 'Need at least 2 people going out to play.' : `${n} players. Loser orders the Uber.`;
  document.querySelectorAll('.mode').forEach(b => { b.disabled = n < 2; });
}

$('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = input.value.trim().replace(/\s+/g, ' ');
  let err = '';
  if (!name) err = '';
  else if (roster.some(p => p.name.toLowerCase() === name.toLowerCase())) err = `${name} is already on the list.`;
  else if (roster.length >= MAX_PLAYERS) err = `That's the max (${MAX_PLAYERS}). Remove someone first.`;
  addError.textContent = err;
  addError.classList.toggle('hidden', !err);
  if (!name || err) return;
  roster.push({ name, going: true, color: nextColor() });
  input.value = '';
  save();
  renderRoster();
});

rosterEl.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.remove !== undefined) roster.splice(+t.dataset.remove, 1);
  else roster[+t.dataset.i].going = !roster[+t.dataset.i].going;
  save();
  renderRoster();
});

$('all-in').addEventListener('click', () => { roster.forEach(p => { p.going = true; }); save(); renderRoster(); });
$('all-out').addEventListener('click', () => { roster.forEach(p => { p.going = false; }); save(); renderRoster(); });

// ---------- Modes ----------

$('modes').innerHTML = [...MODES, RANDOM].map(m => `
  <button type="button" class="mode${m === RANDOM ? ' random' : ''}" data-mode="${m.id}">
    <span class="emoji">${m.emoji}</span>
    <span><span class="title">${m.title}</span><br><span class="blurb">${m.blurb}</span></span>
  </button>`).join('');

$('modes').addEventListener('click', e => {
  const b = e.target.closest('.mode');
  if (!b || b.disabled) return;
  const random = b.dataset.mode === RANDOM.id;
  play(random ? pick(MODES) : MODES.find(m => m.id === b.dataset.mode), random);
});

// ---------- Game flow ----------

let current = null;

function showHome() {
  current?.abort();
  current = null;
  hideResult();
  game.classList.add('hidden');
  home.classList.remove('hidden');
  hud.innerHTML = '';
  hud._html = '';
}

async function play(mode, random = false) {
  const players = going().map(p => ({ ...p }));
  if (players.length < 2) return;
  unlock();
  current?.abort();
  const ctrl = new AbortController();
  current = ctrl;

  hideResult();
  home.classList.add('hidden');
  game.classList.remove('hidden');
  $('game-title').textContent = `${mode.emoji} ${mode.title}`;
  hud.innerHTML = '';
  hud._html = '';
  await new Promise(requestAnimationFrame); // let the canvas get its size

  const loser = await mode.play({ canvas, hud, players, signal: ctrl.signal, sfx });
  if (!loser || ctrl.signal.aborted) return;
  sfx.fanfare();
  showResult(loser, {
    onAgain: () => play(random ? pick(MODES) : mode, random),
    onChange: showHome,
  });
}

$('quit').addEventListener('click', showHome);

// ---------- Sound toggle ----------

function renderMute() {
  document.querySelectorAll('.mute-btn').forEach(b => {
    b.textContent = isMuted() ? '🔇' : '🔊';
    b.setAttribute('aria-pressed', String(isMuted()));
  });
}
document.querySelectorAll('.mute-btn').forEach(b => b.addEventListener('click', () => {
  setMuted(!isMuted());
  renderMute();
  unlock();
}));
renderMute();

// ---------- Fairness test (?simulate=N) ----------

const simRuns = parseInt(new URLSearchParams(location.search).get('simulate'), 10);
if (simRuns > 0) {
  $('sim-panel').classList.remove('hidden');
  $('sim-buttons').innerHTML = MODES.map(m => `<button type="button" class="btn" data-sim="${m.id}">${m.emoji} ${m.title} ×${simRuns}</button>`).join('');
  $('sim-buttons').addEventListener('click', async e => {
    const b = e.target.closest('[data-sim]');
    if (!b) return;
    const mode = MODES.find(m => m.id === b.dataset.sim);
    const players = going().map(p => ({ ...p }));
    if (players.length < 2) return;
    const out = $('sim-out');
    const counts = new Map(players.map(p => [p.name, 0]));
    const t0 = performance.now();
    for (let i = 0; i < simRuns; i++) {
      const loser = mode.simulate(players);
      counts.set(loser.name, counts.get(loser.name) + 1);
      if (i % 5 === 4) {
        out.textContent = `${mode.title}: ${i + 1}/${simRuns}…`;
        await new Promise(r => setTimeout(r));
      }
    }
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    const expected = (100 / players.length).toFixed(1);
    out.innerHTML = `<p class="hint">${mode.title}: ${simRuns} runs in ${secs}s. Expected ${expected}% each.</p>
      <table class="sim-table"><tr><th>Player</th><th>Losses</th><th>%</th></tr>
      ${[...counts].map(([name, c]) => `<tr><td>${esc(name)}</td><td>${c}</td><td>${(100 * c / simRuns).toFixed(1)}</td></tr>`).join('')}
      </table>`;
    window.__lastSim = Object.fromEntries(counts);
  });
}

renderRoster();
