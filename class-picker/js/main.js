// Class Picker: pick a student at random with a game. Shares the game engine with
// Uber Roulette, but every game here picks a winner ("first across the line").

import { pick } from '../../uber-roulette/js/fair.js?v=7';
import { sfx, unlock, isMuted, setMuted } from '../../uber-roulette/js/audio.js?v=7';
import { showResult, hideResult } from '../../uber-roulette/js/result.js?v=7';
import { esc } from '../../uber-roulette/js/stage.js?v=7';
import wheel from '../../uber-roulette/js/modes/wheel.js?v=7';
import marble from '../../uber-roulette/js/modes/marble.js?v=7';
import horse from '../../uber-roulette/js/modes/horse.js?v=7';
import balloon from './modes/balloon.js?v=7';

// Same games, classroom wording
const MODES = [
  { mode: balloon, id: 'balloon', title: 'Balloon Pop', emoji: '🎈', blurb: 'The balloon bounces desk to desk and pops on someone!' },
  { mode: wheel, id: 'wheel', title: 'Spin the Wheel', emoji: '🎡', blurb: 'Classic spinner. Tap the wheel to spin!' },
  { mode: marble, id: 'marble', title: 'Marble Race', emoji: '🔮', blurb: 'First marble to the bottom gets picked!' },
  { mode: horse, id: 'horse', title: 'Horse Race', emoji: '🏇', blurb: 'First horse across the finish line gets picked!' },
];
const RANDOM = { id: 'random', title: 'Surprise me', emoji: '🎲', blurb: 'Pick one of the games at random.' };
const KEY = 'class-picker:roster';
const SETTINGS_KEY = 'class-picker:settings';
const MAX_KIDS = 40;

// 40 distinct colors (golden-angle hues, two lightness bands) so a class of 30 doesn't repeat
const PALETTE = Array.from({ length: MAX_KIDS }, (_, i) => hslHex((i * 137.508) % 360, 72, i % 2 ? 48 : 60));
function hslHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
  return '#' + [f(0), f(8), f(4)].map(v => v.toString(16).padStart(2, '0')).join('');
}

const $ = id => document.getElementById(id);
const home = $('home');
const game = $('game');
const canvas = $('canvas');
const hud = $('hud');
const rosterEl = $('roster');
const addNote = $('add-note');

// ---------- Storage ----------

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ }
}

let roster = read(KEY, []).filter(k => k && typeof k.name === 'string' && k.name.trim());
const settings = { fairTurns: true, ...read(SETTINGS_KEY, {}) };
const save = () => write(KEY, roster);
const saveSettings = () => write(SETTINGS_KEY, settings);

const here = () => roster.filter(k => k.here);
// Who can be picked right now: everyone here, minus kids who've had a turn (with fair turns on)
const pool = () => here().filter(k => !settings.fairTurns || !k.picked);

function nextColor() {
  const used = new Set(roster.map(k => k.color));
  return PALETTE.find(c => !used.has(c)) ?? PALETTE[roster.length % PALETTE.length];
}

function note(text, warn = false) {
  addNote.textContent = text;
  addNote.classList.toggle('warn', warn);
  addNote.classList.toggle('hidden', !text);
}

// ---------- Roster UI ----------

function render() {
  rosterEl.innerHTML = roster.length
    ? roster.map((k, i) => `
      <li class="chip${k.here ? '' : ' out'}${k.picked && settings.fairTurns ? ' done' : ''}" style="--c:${k.color}">
        <button type="button" class="toggle" data-i="${i}" aria-pressed="${k.here}" title="${k.here ? 'Mark absent' : 'Mark here'}">
          <span class="dot"></span><span class="name">${esc(k.name)}</span>${k.picked && settings.fairTurns ? '<span class="star" aria-label="already picked">⭐</span>' : ''}
        </button>
        <button type="button" class="x" data-remove="${i}" aria-label="Remove ${esc(k.name)}">×</button>
      </li>`).join('')
    : '<li class="empty">No students yet. Paste your class list above.</li>';

  const h = here().length;
  const left = pool().length;
  $('here-count').textContent = settings.fairTurns && h ? `${h} here · ${left} still to pick` : `${h} here`;
  const ready = h >= 1;
  $('play-hint').textContent = !roster.length ? 'Add your class to start.' : !h ? 'Mark at least one student as here.' : '';
  document.querySelectorAll('.mode').forEach(b => { b.disabled = !ready; });
  $('fair-turns').checked = settings.fairTurns;
}

$('add-form').addEventListener('submit', e => {
  e.preventDefault();
  const names = $('add-names').value.split(/[\n,;]+/).map(n => n.trim().replace(/\s+/g, ' ')).filter(Boolean);
  if (!names.length) return;
  const existing = new Set(roster.map(k => k.name.toLowerCase()));
  let added = 0;
  let dupes = 0;
  let full = 0;
  for (const name of names) {
    if (existing.has(name.toLowerCase())) { dupes++; continue; }
    if (roster.length >= MAX_KIDS) { full++; continue; }
    roster.push({ name: name.slice(0, 24), here: true, picked: false, color: nextColor() });
    existing.add(name.toLowerCase());
    added++;
  }
  $('add-names').value = '';
  const bits = [`Added ${added} student${added === 1 ? '' : 's'}.`];
  if (dupes) bits.push(`${dupes} already on the list.`);
  if (full) bits.push(`${full} skipped (max ${MAX_KIDS}).`);
  note(bits.join(' '), !added);
  save();
  render();
});

rosterEl.addEventListener('click', e => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.remove !== undefined) roster.splice(+t.dataset.remove, 1);
  else roster[+t.dataset.i].here = !roster[+t.dataset.i].here;
  save();
  render();
});

$('all-here').addEventListener('click', () => { roster.forEach(k => { k.here = true; }); save(); render(); });
$('reset-turns').addEventListener('click', () => {
  roster.forEach(k => { k.picked = false; });
  note('Turns reset. Everyone can be picked again.');
  save();
  render();
});
$('clear-all').addEventListener('click', () => {
  if (!roster.length || !confirm('Remove every student from the list?')) return;
  roster = [];
  note('');
  save();
  render();
});
$('fair-turns').addEventListener('change', e => { settings.fairTurns = e.target.checked; saveSettings(); render(); });

// ---------- Modes ----------

$('modes').innerHTML = [...MODES, RANDOM].map(m => `
  <button type="button" class="mode${m === RANDOM ? ' random' : ''}" data-mode="${m.id}">
    <span class="emoji">${m.emoji}</span>
    <span class="title">${m.title}</span>
    <span class="blurb">${m.blurb}</span>
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
  render();
}

function announce(kid, entry, random, extra = '') {
  if (settings.fairTurns) {
    kid.picked = true;
    save();
  }
  const left = pool().length;
  const msg = extra || (settings.fairTurns && here().length > 1
    ? (left ? `${left} still to pick.` : 'Everyone’s had a turn! Next pick starts a new round.')
    : '');
  $('result-note').textContent = msg;
  $('result-note').classList.toggle('hidden', !msg);
  showResult({ name: `${kid.name}!`, color: kid.color }, {
    onAgain: () => play(random ? pick(MODES) : entry, random),
    onChange: showHome,
  });
}

async function play(entry, random = false) {
  if (!here().length) return;
  // New round when everyone here has had a turn
  let fresh = '';
  if (!pool().length) {
    roster.forEach(k => { k.picked = false; });
    save();
    fresh = 'New round: everyone can be picked again.';
  }
  const kids = pool();
  unlock();
  current?.abort();
  const ctrl = new AbortController();
  current = ctrl;
  hideResult();

  // Only one student left this round: no need for a game
  if (kids.length === 1) {
    sfx.fanfare();
    announce(kids[0], entry, random, fresh || 'Last one this round!');
    return;
  }

  home.classList.add('hidden');
  game.classList.remove('hidden');
  $('game-title').textContent = `${entry.emoji} ${entry.title}`;
  hud.innerHTML = '';
  hud._html = '';
  await new Promise(requestAnimationFrame);

  const players = kids.map(k => ({ name: k.name, color: k.color, id: roster.indexOf(k) }));
  const result = await entry.mode.play({ canvas, hud, players, signal: ctrl.signal, sfx, goal: 'first', hub: '⭐' });
  if (!result || ctrl.signal.aborted) return;
  const kid = roster[result.loser.id];
  sfx.fanfare();
  announce(kid, entry, random, fresh);
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
render();
