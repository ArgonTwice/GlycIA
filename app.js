/* ==========================================================================
   GlycIA — logique applicative (vanilla JS)
   État en mémoire uniquement : rechargement = données de démo.
   ========================================================================== */
(async () => {
"use strict";

/* Données séparées : chargées en parallèle du script, mises en cache par le SW */
const DB = await (await fetch(new URL('./db.json', import.meta.url))).json();
const { FOODS, PLATES, FAVORITES, RECIPES, MENU_DB, FOODDB, FOODDB2, GP_PHASES, GP_TIPS, GP_FOODS, GP_RECIPES, GP_ALERT, CAKE_PRESETS, RAMADAN_PHASES, RAMADAN_TIPS, RAMADAN_FOODS, RAMADAN_RECIPES, RAMADAN_ALERT } = DB;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (n, d = 0) => { const p = 10 ** d; return Math.round(n * p) / p; };

/* ---------- Repère quotidien indicatif ---------- */
let REPERE = 180; // g de glucides, purement indicatif — ajusté après l'onboarding (voir repereFor())

/* ==========================================================================
   1. MASCOTTE — SVG généré, expressions contextuelles
   ========================================================================== */
const FACES = {
  happy:   { mouth:'M24 40 q8 8 16 0',           brow:0,  cheek:.55 },
  hello:   { mouth:'M25 39 q7 7 14 0',           brow:-2, cheek:.6  },
  think:   { mouth:'M26 41 q6 2 12 -1',          brow:-4, cheek:.3  },
  proud:   { mouth:'M23 39 q9 10 18 0',          brow:-1, cheek:.7  },
  calm:    { mouth:'M27 41 h10',                 brow:2,  cheek:.35 },
  care:    { mouth:'M26 42 q6 -4 12 0',          brow:3,  cheek:.45 }
};

function mascotSVG(mood = 'happy', scale = 1) {
  const f = FACES[mood] || FACES.happy;
  return `
  <svg viewBox="0 0 64 64" aria-hidden="true">
    <defs>
      <linearGradient id="gl${mood}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#C9B6E8"/>
        <stop offset="100%" stop-color="#A98FD4"/>
      </linearGradient>
    </defs>
    <g class="ava-blob">
      <path fill="url(#gl${mood})" d="M32 4c11.6 0 22 8.4 22 22 0 6.4-2 11-2 15.6 0 6.6-7.4 18.4-20 18.4S12 48.2 12 41.6C12 37 10 32.4 10 26 10 12.4 20.4 4 32 4z"/>
      <ellipse cx="32" cy="8.5" rx="9" ry="3.2" fill="#fff" opacity=".28"/>
      <circle cx="24" cy="30" r="4.4" fill="#fff"/>
      <circle cx="40" cy="30" r="4.4" fill="#fff"/>
      <circle cx="24.8" cy="30.8" r="2.3" fill="#4A3F63"/>
      <circle cx="40.8" cy="30.8" r="2.3" fill="#4A3F63"/>
      <circle cx="23.9" cy="29.6" r=".85" fill="#fff"/>
      <circle cx="39.9" cy="29.6" r=".85" fill="#fff"/>
      <ellipse class="lid"   cx="24" cy="30" rx="4.6" ry="4.6" fill="url(#gl${mood})"/>
      <ellipse class="lid b" cx="40" cy="30" rx="4.6" ry="4.6" fill="url(#gl${mood})"/>
      <path d="M19 ${23 + f.brow} q5 -3 9 -0.5" stroke="#8E75C4" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".75"/>
      <path d="M36 ${22.5 + f.brow} q4 -2.5 9 0.5" stroke="#8E75C4" stroke-width="1.7" fill="none" stroke-linecap="round" opacity=".75"/>
      <ellipse cx="18.5" cy="35.5" rx="3.4" ry="2.2" fill="#FF8A65" opacity="${f.cheek * .5}"/>
      <ellipse cx="45.5" cy="35.5" rx="3.4" ry="2.2" fill="#FF8A65" opacity="${f.cheek * .5}"/>
      <path d="${f.mouth}" stroke="#4A3F63" stroke-width="2.1" fill="none" stroke-linecap="round"/>
    </g>
  </svg>`;
}

function setMascot(mood) {
  $('#avaMain').innerHTML = mascotSVG(mood);
  $('#avaMini').innerHTML = mascotSVG(mood === 'care' ? 'care' : 'happy');
}

let bubbleTimer = null;
function say(text, mood = 'happy', hold = 0) {
  const b = $('#bubble');
  b.style.animation = 'none';
  void b.offsetWidth;
  b.style.animation = '';
  b.innerHTML = text;
  setMascot(mood);
  clearTimeout(bubbleTimer);
  if (hold) bubbleTimer = setTimeout(() => refreshBubble(), hold);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 10)  return { t: "Bien dormi ? On attaque le petit-déj' ensemble ?", m: 'hello' };
  if (h < 14)  return { t: "Coucou ! Prêt pour ton repas ? 🍽️", m: 'hello' };
  if (h < 18)  return { t: "Petite faim de l'après-midi ? Rien d'interdit ici.", m: 'happy' };
  if (h < 22)  return { t: "Le dîner approche. Envie de quoi ce soir ?", m: 'happy' };
  return { t: "Grignotage nocturne ? On note ça sans jugement.", m: 'calm' };
}

function refreshBubble() {
  const n = state.journal.length;
  if (n === 0) { const g = greeting(); say(g.t, g.m); return; }
  const total = totalCarbs();
  if (total < 60)      say(`Déjà <b>${n}</b> repas noté${n > 1 ? 's' : ''}. Continue comme ça, c'est fluide.`, 'happy');
  else if (total < 140) say(`Belle journée équilibrée jusqu'ici — <b>${total} g</b> au compteur.`, 'proud');
  else                 say(`<b>${total} g</b> aujourd'hui. C'est une info, pas une note. Tout va bien.`, 'calm');
}

/* ==========================================================================
   2. DONNÉES
   ========================================================================== */
/* Aliments : carb = g de glucides / 100 g, ig = indice glycémique */


/* Assiettes simulées par la "reconnaissance photo" */


/* Favoris pré-chargés */


/* Recettes à IG bas */


/* Base plats de restaurant pour le scanner de carte */


/* ==========================================================================
   3. ÉTAT
   ========================================================================== */
const state = {
  gp: false,
  ramadan: false,
  profile: null,
  journal: [],
  analysis: null,
  recipe: null,
  gpLog: []
};

/* Démo pré-chargée */
function seed() {
  const now = new Date();
  const t = (h, m) => { const d = new Date(now); d.setHours(h, m, 0, 0); return d; };
  if (now.getHours() >= 9) {
    state.journal.push({ id: uid(), time: t(8, 15), icon:'🥐', name:'Tartines pain complet, confiture', carbs:47, ig:64, src:'photo' });
  }
  if (now.getHours() >= 14) {
    state.journal.push({ id: uid(), time: t(12, 40), icon:'🥗', name:'Salade poulet, boulgour', carbs:36, ig:38, src:'favori' });
  }
  if (now.getHours() >= 17) {
    state.journal.push({ id: uid(), time: t(16, 30), icon:'🍎', name:'Pomme et quelques amandes', carbs:14, ig:36, src:'favori' });
  }
}

let idc = 0;
function uid() { return 'x' + (++idc) + Date.now().toString(36); }

const totalCarbs = () => state.journal.reduce((s, m) => s + m.carbs, 0);

function avgIg() {
  const w = state.journal.filter(m => m.carbs > 0);
  if (!w.length) return null;
  const num = w.reduce((s, m) => s + m.ig * m.carbs, 0);
  const den = w.reduce((s, m) => s + m.carbs, 0);
  return Math.round(num / den);
}

/* ==========================================================================
   4. RENDU — assiette, favoris, journal
   ========================================================================== */
const C = 2 * Math.PI * 50; // circonférence du ring de l'assiette

function renderDay() {
  const total = totalCarbs();
  const n = state.journal.length;
  const ratio = clamp(total / REPERE, 0, 1.08);

  $('#totalCarbs').textContent = total;
  $('#plateRing').style.strokeDashoffset = C - C * Math.min(ratio, 1);
  $('#plateRing').setAttribute('stroke', total > REPERE ? '#FF8A65' : total > REPERE * .7 ? '#FFB74D' : '#81C784');

  $('#chipMeals').textContent = n === 0 ? 'Aucun repas noté' : n + (n > 1 ? ' repas notés' : ' repas noté');
  const ig = avgIg();
  const chipIg = $('#chipIg');
  chipIg.textContent = ig === null ? 'IG moyen —' : 'IG moyen ' + ig;
  chipIg.className = 'chip ' + (ig === null ? '' : ig < 56 ? 'sage' : ig < 70 ? 'peach' : 'violet');

  const title = $('#dayTitle'), note = $('#dayNote');
  if (n === 0) {
    title.textContent = 'On démarre en douceur';
    note.textContent = 'Repère indicatif : 180 g. Ce n\'est pas une note, juste une boussole.';
  } else if (total < REPERE * .55) {
    title.textContent = 'Journée légère';
    note.textContent = `Il te reste de la marge si l'envie d'un dessert se présente.`;
  } else if (total <= REPERE) {
    title.textContent = 'Bien dans le rythme';
    note.textContent = `${REPERE - total} g avant le repère du jour. Rien d'urgent, c'est indicatif.`;
  } else {
    title.textContent = 'Une journée plus gourmande';
    note.textContent = 'Ça arrive, et c\'est très bien ainsi. Une marche après le repas fait beaucoup de bien.';
  }

  $('#journalTotal').textContent = total + ' g';
  if (typeof saveState === 'function') saveState();
  if (typeof renderWeek === 'function' && $('#weekChart')) renderWeek();
  renderTimeline();
  refreshBubble();
}

function igClass(ig) { return ig < 56 ? 'ig-low' : ig < 70 ? 'ig-mid' : 'ig-high'; }
function igLabel(ig) { return ig < 56 ? 'IG bas' : ig < 70 ? 'IG moyen' : 'IG élevé'; }
const hhmm = d => String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');

function renderTimeline() {
  const wrap = $('#timeline');
  if (!state.journal.length) {
    wrap.innerHTML = `<div class="empty"><strong>Rien de noté pour l'instant</strong>
      Photographie ton assiette ou touche un favori : ça prend trois secondes.</div>`;
    return;
  }
  const sorted = [...state.journal].sort((a, b) => a.time - b.time);
  const dot = { photo:'peach', favori:'', recette:'violet', menu:'sand', part:'peach', aliment:'violet' };
  wrap.innerHTML = '<div class="tl">' + sorted.map(m => `
    <div class="tl-item">
      <span class="tl-dot ${dot[m.src] || ''}"></span>
      <div class="meal">
        <span class="meal-ico">${m.icon}</span>
        <div class="meal-body">
          <div class="meal-top">
            <span class="meal-name">${esc(m.name)}</span>
            <span class="meal-time">${hhmm(m.time)}</span>
          </div>
          <div class="meal-stats">
            <span class="stat g">${m.carbs} g glucides</span>
            <span class="stat ${igClass(m.ig)}">${igLabel(m.ig)} · ${m.ig}</span>
            <span class="stat">CG ${round(m.ig * m.carbs / 100)}</span>
          </div>
        </div>
        <button class="meal-del" data-del="${m.id}" aria-label="Retirer ${esc(m.name)}">
          <svg><use href="#i-trash"/></svg>
        </button>
      </div>
    </div>`).join('') + '</div>';
}

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

function renderFavorites() {
  $('#favRail').innerHTML = FAVORITES.map((f, i) => `
    <button class="fav" data-fav="${i}">
      <span class="fav-ico">${f.icon}</span>
      <span class="fav-name">${esc(f.name)}</span>
      <span class="fav-meta">${f.carbs} g · ${igLabel(f.ig)}</span>
      <span class="fav-add"><svg><use href="#i-plus"/></svg> Ajouter</span>
    </button>`).join('') +
    `<div class="fav ghost">Tes prochains repas analysés atterriront ici</div>`;
}

/* ==========================================================================
   5. AJOUT AU JOURNAL + TOASTS
   ========================================================================== */
function addMeal({ icon, name, carbs, ig, src }) {
  state.journal.push({ id: uid(), time: new Date(), icon, name, carbs: Math.round(carbs), ig: Math.round(ig), src });
  renderDay();
}

const PRAISE = [
  'C\'est noté, sans jugement.',
  'Ajouté. Tu gères ta journée, pas l\'inverse.',
  'Enregistré. Bon appétit !',
  'Dans le journal. Rien de plus à faire.',
  'C\'est dans la boîte. Profite de ton repas.'
];

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<svg><use href="#i-check"/></svg><span>${msg}</span>`;
  $('#toastZone').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2600);
}

/* ==========================================================================
   6. NAVIGATION
   ========================================================================== */
function go(tab) {
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
  $$('.nav-btn').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('.nav-btn').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));

/* ==========================================================================
   7. MODALES
   ========================================================================== */
let lastFocus = null;
function openModal(id) {
  lastFocus = document.activeElement;
  const m = $('#m-' + id);
  m.classList.add('on');
  document.body.style.overflow = 'hidden';
  const f = m.querySelector('button, input, textarea');
  if (f) setTimeout(() => f.focus(), 120);
}
function closeModal(m) {
  if (m.id === 'm-shoot') stopCam();
  if (m.id === 'm-scan' && typeof stopBd === 'function') stopBd();
  if (m.id === 'm-sos' && typeof exitHypo === 'function') exitHypo();
  if (m.id === 'm-onboard' && typeof finishOnboarding === 'function') finishOnboarding();
  m.classList.remove('on');
  document.body.style.overflow = '';
  if (lastFocus) lastFocus.focus();
}
document.addEventListener('click', e => {
  const open = e.target.closest('[data-open]');
  if (open) { const id = open.dataset.open; id === 'shoot' ? startShoot() : openModal(id); return; }
  if (e.target.closest('[data-close]')) { closeModal(e.target.closest('.veil')); return; }
  if (e.target.classList.contains('veil')) { closeModal(e.target); return; }
  const del = e.target.closest('[data-del]');
  if (del) {
    state.journal = state.journal.filter(m => m.id !== del.dataset.del);
    renderDay(); toast('Repas retiré du journal'); return;
  }
  const fav = e.target.closest('[data-fav]');
  if (fav) {
    const f = FAVORITES[+fav.dataset.fav];
    addMeal({ icon:f.icon, name:f.name, carbs:f.carbs, ig:f.ig, src:'favori' });
    toast(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
    say(`<b>${esc(f.name)}</b> ajouté en un clic. ${f.ig < 56 ? 'Et en plus, IG bas 🌿' : 'Bon appétit !'}`, 'proud', 6000);
    return;
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const m = $('.veil.on'); if (m) closeModal(m); }
});

/* ==========================================================================
   8. SOS HYPO — minuteur 15 min
   ========================================================================== */
const T_TOTAL = 15 * 60;
const RC = 2 * Math.PI * 52;
let tLeft = T_TOTAL, tId = null, tRunning = false;

function paintTimer() {
  const m = Math.floor(tLeft / 60), s = tLeft % 60;
  $('#timerVal').textContent = m + ':' + String(s).padStart(2, '0');
  $('#timerRing').style.strokeDashoffset = RC * (1 - tLeft / T_TOTAL);
}
function timerBtn(run) {
  $('#timerToggle').innerHTML = run
    ? '<svg><use href="#i-pause"/></svg> Pause'
    : '<svg><use href="#i-play"/></svg> ' + (tLeft === T_TOTAL ? 'Lancer' : 'Reprendre');
}
function tick() {
  tLeft--;
  paintTimer();
  if (tLeft === 600 && hypoMode) speakFr('Encore dix minutes.');
  if (tLeft === 300) {
    $('#timerMsg').textContent = '5 minutes passées. Reste assis, ça remonte.';
    if (hypoMode) speakFr('Encore cinq minutes.');
  }
  if (tLeft <= 0) {
    stopTimer();
    tLeft = 0; paintTimer();
    $('#timerMsg').innerHTML = '15 minutes écoulées — <b>recontrôle ta glycémie maintenant.</b> Toujours sous 0,70 g/L ? Reprends 15 g.';
    $('#timerMsg').classList.add('done');
    chime();
    if (hypoMode) speakFr('Quinze minutes écoulées. Recontrôle ta glycémie maintenant.');
  }
}
function stopTimer() { clearInterval(tId); tId = null; tRunning = false; timerBtn(false); }
function startTimer() {
  if (tRunning) return;
  tRunning = true; tId = setInterval(tick, 1000); timerBtn(true);
  $('#timerMsg').classList.remove('done');
  $('#timerMsg').textContent = 'Pas de panique, pas de resucrage supplémentaire avant la fin. Respire.';
}
function chime() {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    [660, 880].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      o.connect(g); g.connect(ac.destination);
      const t0 = ac.currentTime + i * .42;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(.25, t0 + .05);
      g.gain.exponentialRampToValueAtTime(.001, t0 + .5);
      o.start(t0); o.stop(t0 + .55);
    });
  } catch (_) {}
}
$('#timerToggle').addEventListener('click', () => tRunning ? (stopTimer(), $('#timerMsg').textContent = 'Minuteur en pause.') : startTimer());
$('#timerReset').addEventListener('click', () => {
  stopTimer(); tLeft = T_TOTAL; paintTimer();
  $('#timerMsg').classList.remove('done');
  $('#timerMsg').textContent = 'Minuteur remis à 15:00.';
});
$('#btnSos').addEventListener('click', () => {
  openModal('sos');
  say('Je reste avec toi. 15 g de sucre rapide, puis 15 minutes de pause.', 'care', 12000);
});
paintTimer();

/* ---------- Mode hypo : gros caractères, contraste renforcé, sans distraction ---------- */
let hypoMode = false, hypoHoldId = null;
const HYPO_HOLD_MS = 2000;

function speakFr(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    speechSynthesis.speak(u);
  } catch (_) {}
}
function paintHypoBtn() {
  const b = $('#hypoToggle');
  b.innerHTML = hypoMode
    ? '<span class="fill"></span><span>Maintenir 2 s pour quitter</span>'
    : '<svg><use href="#i-eye"/></svg> Mode hypo — gros caractères, sans distraction';
}
function enterHypo() {
  if (hypoMode) return;
  hypoMode = true;
  document.body.classList.add('hypo');
  paintHypoBtn();
  speakFr('Prends 15 grammes de sucre rapide, puis attends 15 minutes avant de recontrôler ta glycémie.');
}
function exitHypo() {
  if (!hypoMode) return;
  hypoMode = false;
  document.body.classList.remove('hypo');
  paintHypoBtn();
  try { speechSynthesis.cancel(); } catch (_) {}
}
$('#hypoToggle').addEventListener('click', () => { if (!hypoMode) enterHypo(); });
$('#hypoToggle').addEventListener('pointerdown', () => {
  if (!hypoMode) return;
  const fill = $('#hypoToggle .fill');
  if (fill) { fill.style.transition = `width ${HYPO_HOLD_MS}ms linear`; fill.style.width = '100%'; }
  hypoHoldId = setTimeout(exitHypo, HYPO_HOLD_MS);
});
['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('#hypoToggle').addEventListener(ev, () => {
  clearTimeout(hypoHoldId);
  const fill = $('#hypoToggle .fill');
  if (fill) { fill.style.transition = 'none'; fill.style.width = '0'; }
}));

/* ==========================================================================
   9. ANALYSE D'ASSIETTE
   Vision Claude si l'API est joignable, estimation locale sinon.
   ========================================================================== */
const VISION = {
  model: 'claude-sonnet-4-6',
  maxSide: 1200,     // px — compression avant envoi
  quality: .82,
  timeout: 32000,
  ok: null           // null = jamais testé, true/false ensuite
};
const MIN_SCAN = 1500;   // ms — évite le flash si la réponse arrive trop vite
const wait = ms => new Promise(r => setTimeout(r, ms));

function startShoot() {
  state.analysis = null;
  mergeNext = false;
  renderShootIntro();
  openModal('shoot');
}

/* ---------- A. Compression canvas ---------- */
function compress(dataURL, max = VISION.maxSide, q = VISION.quality) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      if (s === 1 && dataURL.length < 800000) return res(dataURL);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s) || 900;
      c.height = Math.round(img.height * s) || 1200;
      const cx = c.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, c.width, c.height);
      cx.drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => res(dataURL);
    img.src = dataURL;
  });
}

/* ---------- Caméra / import ---------- */
let camStream = null;
let mergeNext = false;

function stopCam() {
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
}

function readImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { hint('Ce fichier n\'est pas une image.', true); return; }
  const r = new FileReader();
  r.onload = () => runAnalysis(r.result, null, mergeNext);
  r.onerror = () => hint('Lecture impossible. Essaie une autre image, ou une assiette type.', true);
  r.readAsDataURL(file);
}

function hint(txt, warn) {
  const h = $('#shootHint');
  if (!h) return;
  h.innerHTML = txt;
  h.style.color = warn ? 'var(--terra-deep)' : '';
}

function renderShootIntro() {
  stopCam();
  $('#shootBody').innerHTML = `
    ${mergeNext ? `<div class="glycia-note" style="margin-bottom:14px">
      <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('happy')}</div>
      <div><span class="who">GlycIA —</span> Deuxième photo du même repas : j'ajoute ce que je vois aux aliments déjà reconnus.</div>
    </div>` : ''}
    <div class="shoot-opts">
      <button class="opt" id="optCam">
        <span class="oi bg-peach"><svg><use href="#i-cam"/></svg></span>
        <span class="ot"><strong>Ouvrir l'appareil photo</strong><em>Prise de vue directe</em></span>
      </button>
      <label class="opt" id="optFile">
        <span class="oi bg-sage"><svg><use href="#i-plus"/></svg></span>
        <span class="ot"><strong>Choisir une image</strong><em>Galerie, photos, ou glisser-déposer</em></span>
        <input type="file" id="fileIn" accept="image/*" capture="environment">
      </label>
    </div>

    <div class="eyebrow" style="margin:18px 0 9px">Ou pars d'une assiette type</div>
    <div class="demo-grid">${PLATES.map((p, i) => `
      <button class="demo-cell" data-demo="${i}" aria-label="${esc(p.name)}">
        <span class="e">${p.icon}</span><span class="l">${esc(p.name.split(' ').slice(0, 2).join(' '))}</span>
      </button>`).join('')}
    </div>

    <p class="foot-note">📏 Pose une carte bancaire ou une fourchette à côté de l'assiette : ça calibre les volumes et divise l'erreur d'estimation par deux.</p>
    <p class="foot-note" id="shootHint">La photo est réduite puis analysée. Rien n'est conservé après la fermeture.</p>`;

  $('#optCam').addEventListener('click', openCam);
  $('#fileIn').addEventListener('change', e => readImage(e.target.files && e.target.files[0]));

  const zone = $('#optFile');
  ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('hot'); }));
  ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('hot'); }));
  zone.addEventListener('drop', e => readImage(e.dataTransfer.files && e.dataTransfer.files[0]));

  $$('#shootBody [data-demo]').forEach(b =>
    b.addEventListener('click', () => runAnalysis(null, PLATES[+b.dataset.demo], mergeNext)));
}

async function openCam() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    hint('L\'appareil photo n\'est pas disponible ici. Utilise « Choisir une image » ou une assiette type.', true);
    return;
  }
  $('#shootBody').innerHTML = `
    <div class="cam-wrap">
      <video id="camVideo" playsinline autoplay muted></video>
      <button class="cam-shot" id="camShot" aria-label="Prendre la photo"></button>
    </div>
    <div class="sheet-foot"><button class="btn btn-ghost" id="camBack">Retour</button></div>
    <p class="foot-note" id="shootHint">Cadre ton assiette de haut. Une carte bancaire ou une fourchette posée à côté calibre les volumes.</p>`;
  $('#camBack').addEventListener('click', () => { stopCam(); renderShootIntro(); });

  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    const v = $('#camVideo');
    v.srcObject = camStream;
    await v.play();
    $('#camShot').addEventListener('click', () => {
      const c = document.createElement('canvas');
      c.width = v.videoWidth || 900; c.height = v.videoHeight || 1200;
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      const url = c.toDataURL('image/jpeg', .9);
      stopCam();
      runAnalysis(url, null, mergeNext);
    });
  } catch (err) {
    stopCam();
    renderShootIntro();
    hint('L\'appareil photo est bloqué dans cet aperçu (permission refusée ou page intégrée). Passe par « Choisir une image » ou une assiette type.', true);
  }
}

/* ---------- C. Vision Claude : contexte de la journée + cache ---------- */

/* [A] Ce que Claude doit savoir de la journée pour conseiller juste */
const TREAT_LABEL = { insuline: 'insuline', oral: 'traitement oral', alimentaire: 'alimentaire seul' };
function profileContext() {
  const p = state.profile;
  const bits = [];
  if (p && p.type) bits.push(`diabète type ${p.type}`);
  if (p && p.treatment) bits.push(TREAT_LABEL[p.treatment] || p.treatment);
  if (p && p.gp) bits.push('gastroparésie');
  if (state.ramadan) bits.push('mois de Ramadan (jeûne)');
  return bits.length ? `Profil : ${bits.join(', ')}. ` : '';
}
const momentOf = h => h < 11 ? 'matin' : h < 15 ? 'midi' : h < 18 ? 'gouter' : 'soir';
const MOMENT_LABEL = { matin: 'petit-déjeuner', midi: 'déjeuner', gouter: 'goûter', soir: 'dîner' };
const ramadanMoment = h => (h >= 3 && h < 6) ? 'Suhoor (avant l\'aube)' : (h >= 18 && h < 22) ? 'Iftar (rupture du jeûne)' : 'hors repas, pendant le jeûne';
function dayContext() {
  const t = totalCarbs(), n = state.journal.length, ig = avgIg();
  const moment = state.ramadan ? ramadanMoment(new Date().getHours()) : MOMENT_LABEL[momentOf(new Date().getHours())];
  const profil = profileContext();
  if (!n) return `${profil}Premier repas noté de la journée, plutôt un ${moment}. Repère indicatif quotidien : ${REPERE} g de glucides.`;
  return `${profil}Déjà ${n} repas noté${n > 1 ? 's' : ''} aujourd'hui, ${t} g de glucides cumulés, IG moyen pondéré ${ig}. `
       + `Repère indicatif quotidien : ${REPERE} g. Ce repas-ci est plutôt un ${moment}. `
       + `Détail de la journée : ${state.journal.map(m => `${m.name} (${m.carbs} g, IG ${m.ig})`).join(' ; ')}.`;
}

/* [A] Bloc STABLE identique à chaque appel -> mis en cache côté API.
   On y glisse une table de référence tirée de la base locale : elle ancre les
   estimations du modèle ET fait passer le bloc au-dessus du seuil de cache. */
let IG_REF = null;
function igRefTable() {
  if (IG_REF) return IG_REF;
  const src = ALL.filter(f => f.c > 0 && !f.off);
  const step = Math.max(1, Math.floor(src.length / 150));
  IG_REF = src.filter((_, i) => i % step === 0).slice(0, 150)
    .map(f => `${f.n} = ${f.c} g/100g, IG ${f.ig}`).join('\n');
  return IG_REF;
}

const VISION_RULES = () => `Tu analyses la photo d'un repas pour GlycIA, une application de suivi des repas pour personnes diabétiques.

Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour et sans balises Markdown.
Format exact attendu :
{"plat":"nom court du repas","emoji":"1 emoji","echelle":false,"aliments":[{"nom":"...","emoji":"1 emoji","grammes":120,"glucides_100g":25,"ig":55,"unite":"poignée"}],"conseil":"une phrase"}
Règles :
- "grammes" : poids estimé de la portion réellement visible dans l'assiette.
- "glucides_100g" : grammes de glucides pour 100 g de cet aliment tel qu'il est servi (cuit).
- "ig" : indice glycémique de l'aliment, 0 s'il ne contient pas de glucides.
- "unite" : le mot qui décrit naturellement une portion (poignée, cuillère, tranche, part, unité, demi-assiette, verre).
- 8 aliments maximum, du plus important au moins important.
- "echelle" : true si un objet de référence de taille connue est visible à côté de l'assiette (carte bancaire = 85,6 × 54 mm, fourchette ≈ 19 cm, pièce de 2 € = 25,75 mm) — utilise-le alors pour calibrer précisément les grammages. Sinon false.
- "conseil" : UNE phrase de 25 mots maximum, au tutoiement, chaleureuse, qui tient compte du contexte de journée fourni par l'utilisateur. Jamais de culpabilisation, jamais d'interdit, jamais de dose d'insuline ni de consigne médicale : parle uniquement de l'assiette, de l'ordre dans lequel manger, ou d'une marche après le repas.
- Si la photo ne montre aucun aliment identifiable, renvoie "aliments": [].

Table de référence de l'application — aligne-toi sur ces valeurs quand l'aliment y figure :
${igRefTable()}`;

/* [B] Cache : hash léger de l'image, une même assiette n'est payée qu'une fois */
const VCACHE = new Map();
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + '.' + s.length.toString(36);
}
/* Copie profonde : les ± sur les portions ne doivent jamais toucher l'entrée en cache */
const cloneRes = (r, cached) => ({
  icon: r.icon, name: r.name, cached, echelle: r.echelle,
  advice: (!cached || r.ctxN === state.journal.length) ? r.advice : null,
  items: r.items.map(it => ({ q: it.q, f: { ...it.f } }))
});

async function visionAnalyze(dataURL) {
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i.exec(dataURL);
  if (!m) { VISION.ok = false; return null; }

  const key = hashStr(m[2]);
  if (VCACHE.has(key)) { VISION.ok = true; return cloneRes(VCACHE.get(key), true); }

  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), VISION.timeout);
  try {
    const r = await fetch(aiURL(), {
      method: 'POST',
      headers: aiHeaders(),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: VISION.model,
        max_tokens: 1000,
        system: [{ type: 'text', text: VISION_RULES(), cache_control: { type: 'ephemeral' } }],
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: m[1].toLowerCase(), data: m[2] } },
            { type: 'text', text: 'Contexte de la journée : ' + dayContext() }
          ]
        }]
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = pickJSON(await r.json());
    const items = (j.aliments || []).filter(a => a && a.nom).slice(0, 8).map(a => ({
      q: 1,
      f: {
        n: String(a.nom).slice(0, 42),
        e: String(a.emoji || '🍽️').slice(0, 4),
        carb: clamp(+a.glucides_100g || 0, 0, 100),
        ig: clamp(Math.round(+a.ig || 0), 0, 110),
        unit: String(a.unite || 'portion').slice(0, 16),
        g: clamp(Math.round(+a.grammes || 80), 5, 700)
      }
    }));
    if (!items.length) throw new Error('aucun aliment');

    const res = {
      icon: String(j.emoji || '🍽️').slice(0, 4),
      name: String(j.plat || 'Mon assiette').slice(0, 52),
      echelle: !!j.echelle,
      advice: j.conseil ? String(j.conseil).slice(0, 220) : null,
      ctxN: state.journal.length,
      items
    };
    VCACHE.set(key, res);
    VISION.ok = true;
    return cloneRes(res, false);
  } catch (e) {
    VISION.ok = false;
    return null;
  } finally {
    clearTimeout(to);
  }
}

/* Extraction JSON tolérante : blocs multiples, fences Markdown, texte parasite */
function pickJSON(data) {
  const txt = (data.content || [])
    .map(c => (c && c.type === 'text' ? c.text : '') || '')
    .join('\n')
    .replace(/```json|```/g, '')
    .trim();
  const a = txt.indexOf('{'), b = txt.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('pas de JSON');
  return JSON.parse(txt.slice(a, b + 1));
}

/* ---------- Écran d'analyse ---------- */
const STEPS_IMG = ['Image réduite et préparée…', 'Envoi à Claude…', 'Identification des aliments…', 'Estimation des volumes…', 'Calcul des glucides et de l\'IG…'];
const STEPS_SIM = ['Cadrage détecté…', 'Séparation des aliments…', 'Estimation des volumes…', 'Calcul des glucides et de l\'IG…'];
let scanTimer = null;

function showScanning(img, plate) {
  $('#shootBody').innerHTML = `
    <div class="shot">${img
      ? `<img src="${img}" alt="Ton assiette">`
      : `<div class="fake"><span class="e">${plate ? plate.icon : '🍽️'}</span><span>Assiette type</span></div>`}</div>
    <div class="scan"><div class="scan-ring"></div><div class="scan-step" id="scanStep"></div></div>`;
  setMascot('think');
  const steps = img ? STEPS_IMG : STEPS_SIM;
  let i = 0;
  $('#scanStep').textContent = steps[0];
  clearInterval(scanTimer);
  scanTimer = setInterval(() => {
    i = (i + 1) % steps.length;
    const el = $('#scanStep');
    if (el) el.textContent = steps[i];
  }, 780);
}
function stopScanning() { clearInterval(scanTimer); scanTimer = null; }

/* ---------- B. Fusion multi-photos ---------- */
const mk = (key, q) => ({ f: FOODS[key], q });

function mergeItems(a, b) {
  const out = a.map(x => ({ f: x.f, q: x.q }));
  b.forEach(it => {
    const hit = out.find(x => normalize(x.f.n) === normalize(it.f.n));
    if (hit) hit.q = round(hit.q + it.q, 1);
    else out.push(it);
  });
  return out.slice(0, 12);
}

async function runAnalysis(rawURL, forced, merge) {
  const t0 = Date.now();
  let img = null;
  if (rawURL) img = await compress(rawURL);
  showScanning(img, forced);

  let plate = null, items = null, source = 'local', advice = null, echelle = false;
  if (img) {
    const v = await visionAnalyze(img);
    if (v) {
      plate = { icon: v.icon, name: v.name };
      items = v.items;
      advice = v.advice;
      echelle = v.echelle;
      source = v.cached ? 'cache' : 'vision';
    }
  }
  if (!items) {
    const p = forced || PLATES[Math.floor(Math.random() * PLATES.length)];
    plate = { icon: p.icon, name: p.name };
    items = p.items.map(([k, q]) => mk(k, q));
    source = img ? 'fallback' : 'local';
  }

  const left = MIN_SCAN - (Date.now() - t0);
  if (left > 0) await wait(left);
  stopScanning();

  const prev = merge && state.analysis ? state.analysis : null;
  const merged = prev ? mergeItems(prev.items, items) : items;
  state.analysis = {
    shots: (prev ? prev.shots : []).concat(img ? [img] : []),
    plate: prev
      ? { icon: prev.plate.icon, name: (prev.plate.name + ' + ' + plate.name.toLowerCase()).slice(0, 58) }
      : plate,
    items: merged,
    /* le conseil de Claude vaut pour UNE photo : après fusion, on repasse au message local */
    advice: prev ? null : advice,
    echelle: (prev && prev.echelle) || echelle,
    baseCarbs: computeTotals(merged).carbs,
    source: prev && (prev.source === 'vision' || prev.source === 'cache') ? prev.source : source
  };
  mergeNext = false;
  renderResult();
}

/* ---------- Calculs ---------- */
function computeTotals(items) {
  let carbs = 0, cg = 0;
  items.forEach(it => {
    const c = it.q * it.f.g * it.f.carb / 100;
    carbs += c;
    cg += c * it.f.ig / 100;
  });
  const ig = carbs > 0 ? Math.round(cg / carbs * 100) : 0;
  return { carbs: Math.round(carbs), cg: Math.round(cg), ig };
}

function cgLabel(cg) { return cg < 11 ? 'faible' : cg < 20 ? 'modérée' : 'élevée'; }

function noteFor(t) {
  if (t.carbs === 0) return "Assiette sans glucides, ta glycémie ne bougera quasiment pas. Régale-toi.";
  if (t.ig < 50 && t.carbs < 45) return "Belle assiette : peu de glucides et un IG bas, la montée sera douce.";
  if (t.ig < 56) return "IG bas grâce aux fibres et aux protéines présentes. Rien à changer.";
  if (t.carbs > 75) return "Assiette généreuse. Commence par les légumes et les protéines : la montée sera plus lente.";
  if (t.ig >= 70) return "IG plutôt élevé. Un filet d'huile d'olive ou une salade en entrée adoucirait la courbe.";
  return "Assiette équilibrée. Un peu de vert en plus et la montée serait encore plus régulière.";
}

const SRC_BADGE = {
  vision:   { c:'sage',   t:'Analysé par Claude' },
  cache:    { c:'violet', t:'Claude · déjà analysé' },
  fallback: { c:'peach',  t:'Estimation locale — Claude injoignable' },
  local:    { c:'',       t:'Assiette type' }
};

/* Le conseil de Claude reste valable tant que les portions n'ont pas trop bougé */
function currentNote() {
  const a = state.analysis;
  const t = computeTotals(a.items);
  if (a.advice) {
    const drift = a.baseCarbs > 0 ? Math.abs(t.carbs - a.baseCarbs) / a.baseCarbs : (t.carbs > 0 ? 1 : 0);
    if (drift <= .25) return a.advice;
  }
  return noteFor(t);
}

/* ---------- Résultat ---------- */
function renderResult() {
  const a = state.analysis;
  const t = computeTotals(a.items);
  const igCol = t.ig < 56 ? '#81C784' : t.ig < 70 ? '#FFB74D' : '#E57373';
  const b = SRC_BADGE[a.source];

  $('#shootBody').innerHTML = `
    <div class="shot" style="margin-bottom:10px">
      ${a.shots.length ? `<img src="${a.shots[a.shots.length - 1]}" alt="Ton assiette">`
                       : `<div class="fake"><span class="e">${a.plate.icon}</span><span>${esc(a.plate.name)}</span></div>`}
      <button class="shot-retake" id="retake"><svg><use href="#i-refresh"/></svg> Refaire</button>
    </div>

    ${a.shots.length > 1 ? `<div class="thumbs">${a.shots.map((s, i) =>
      `<img src="${s}" alt="Photo ${i + 1}">`).join('')}<span class="thumbs-n">${a.shots.length} photos fusionnées</span></div>` : ''}

    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:12px 0 10px;flex-wrap:wrap">
      <span class="eyebrow">${a.items.length} aliment${a.items.length > 1 ? 's' : ''} — ajuste les portions</span>
      <span style="display:flex;gap:6px;flex-wrap:wrap">
        ${a.echelle ? '<span class="chip sage">📏 Volumes calibrés</span>' : ''}
        <span class="chip ${b.c}">${b.t}</span>
      </span>
    </div>
    <div id="itemList"></div>

    <button class="btn btn-outline btn-block" id="addShot" style="margin-top:2px">
      <svg><use href="#i-plus"/></svg> Ajouter une autre photo de ce repas
    </button>

    <div class="recap">
      <div class="recap-grid">
        <div class="recap-cell"><div class="v" id="rCarb" style="color:var(--peach-deep)">${t.carbs}</div><div class="k">Glucides</div><div class="h">grammes</div></div>
        <div class="recap-cell"><div class="v" id="rIg" style="color:${igCol}">${t.ig}</div><div class="k">Indice IG</div><div class="h" id="rIgL">${igLabel(t.ig)}</div></div>
        <div class="recap-cell"><div class="v" id="rCg" style="color:var(--violet-deep)">${t.cg}</div><div class="k">Charge CG</div><div class="h" id="rCgL">${cgLabel(t.cg)}</div></div>
      </div>
      <div class="recap-bar"><i id="rBar" style="width:${clamp(t.carbs / 120 * 100, 3, 100)}%;background:${igCol}"></i></div>
    </div>

    <div class="glycia-note">
      <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('happy')}</div>
      <div><span class="who">GlycIA —</span> <span id="rNote">${esc(currentNote())}</span></div>
    </div>

    <div class="sheet-foot">
      <button class="btn btn-ghost" data-close>Annuler</button>
      <button class="btn btn-primary" id="saveMeal"><svg><use href="#i-check"/></svg> Enregistrer</button>
    </div>`;

  renderItems();
  $('#retake').addEventListener('click', () => { mergeNext = false; state.analysis = null; renderShootIntro(); });
  $('#addShot').addEventListener('click', () => { mergeNext = true; renderShootIntro(); });
  $('#saveMeal').addEventListener('click', () => {
    const tt = computeTotals(state.analysis.items);
    addMeal({ icon: state.analysis.plate.icon, name: state.analysis.plate.name, carbs: tt.carbs, ig: tt.ig, src: 'photo' });
    closeModal($('#m-shoot'));
    toast(PRAISE[Math.floor(Math.random() * PRAISE.length)]);
    say(`<b>${tt.carbs} g</b> ajoutés. ${tt.ig < 56 ? 'Avec un IG bas, en plus 🌿' : 'C\'est noté, sans jugement.'}`, 'proud', 7000);
  });
}

function renderItems() {
  const a = state.analysis;
  $('#itemList').innerHTML = a.items.map((it, i) => {
    const f = it.f;
    const grams = Math.round(it.q * f.g);
    const c = Math.round(it.q * f.g * f.carb / 100);
    return `
    <div class="item">
      <span class="item-ico">${f.e}</span>
      <div class="item-body">
        <div class="item-name">${esc(f.n)}${state.gp && gpLevel({ n:f.n, cat:'Plats préparés & cuisine maison', c:f.carb, kcal:0 }) === 3 ? `<span class="gp-badge no">⛔</span>` : ''}</div>
        <div class="item-meta">≈ ${grams} g · ${c} g de glucides${f.carb ? ' · IG ' + f.ig : ''}</div>
      </div>
      <div class="step">
        <button data-q="${i}" data-d="-1" aria-label="Réduire la portion de ${esc(f.n)}">−</button>
        <span class="qty">${fmtQ(it.q)}<small>${esc(f.unit)}${it.q > 1 && !f.unit.endsWith('s') ? 's' : ''}</small></span>
        <button data-q="${i}" data-d="1" aria-label="Augmenter la portion de ${esc(f.n)}">+</button>
      </div>
    </div>`;
  }).join('');

  $$('#itemList [data-q]').forEach(b => b.addEventListener('click', () => {
    const it = a.items[+b.dataset.q];
    it.q = clamp(round(it.q + (+b.dataset.d) * .5, 1), 0, 8);
    renderItems();
    updateRecap();
  }));
}

function fmtQ(q) {
  if (q === 0) return '0';
  if (q === .5) return '½';
  return Number.isInteger(q) ? String(q) : String(q).replace(/\.5$/, '½');
}

function updateRecap() {
  const t = computeTotals(state.analysis.items);
  const igCol = t.ig < 56 ? '#81C784' : t.ig < 70 ? '#FFB74D' : '#E57373';
  $('#rCarb').textContent = t.carbs;
  $('#rIg').textContent = t.ig; $('#rIg').style.color = igCol;
  $('#rIgL').textContent = igLabel(t.ig);
  $('#rCg').textContent = t.cg; $('#rCgL').textContent = cgLabel(t.cg);
  $('#rBar').style.width = clamp(t.carbs / 120 * 100, 3, 100) + '%';
  $('#rBar').style.background = igCol;
  $('#rNote').textContent = currentNote();
}

$('#btnShoot').addEventListener('click', startShoot);
$('#fabShoot').addEventListener('click', startShoot);

/* ==========================================================================
   10. ASSISTANT RECETTES
   ========================================================================== */
const SUGGESTIONS = ['Un truc réconfortant', 'Courgettes et œufs', 'Envie de sucré', 'Rapide, 15 min', 'Restes de poulet', 'Léger pour ce soir'];
$('#recipeSuggest').innerHTML = SUGGESTIONS.map(s => `<button data-sug="${esc(s)}">${esc(s)}</button>`).join('');
$$('#recipeSuggest [data-sug]').forEach(b => b.addEventListener('click', () => {
  $('#recipeInput').value = b.dataset.sug;
  findRecipe();
}));

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function findRecipe() {
  const raw = $('#recipeInput').value.trim();
  const q = normalize(raw);
  let best = null, bestScore = 0;
  RECIPES.forEach(r => {
    let sc = 0;
    if (state.gp) { const lv = gpRecipeLevel(r); if (lv === 3) sc -= 4; if (lv === 1) sc += 3; }
    r.key.forEach(k => { if (q.includes(normalize(k))) sc += 2; });
    normalize(r.title).split(/\W+/).forEach(w => { if (w.length > 3 && q.includes(w)) sc += 1; });
    if (sc > bestScore) { bestScore = sc; best = r; }
  });
  if (!best) best = RECIPES[Math.floor(Math.random() * RECIPES.length)];
  state.recipe = best;
  renderRecipe(best, bestScore > 0 && raw.length > 0);
}

function renderRecipe(r, matched) {
  const cg = Math.round(r.ig * r.carbs / 100);
  $('#recipeOut').innerHTML = `
    <div class="recipe">
      <div class="recipe-hero">
        <div class="eyebrow">${matched ? 'Pour ce que tu as sous la main' : 'La suggestion de GlycIA'}</div>
        <h3 style="margin-top:8px">${esc(r.title)}</h3>
        ${state.gp ? `<div style="margin:6px 0 8px"><span class="gp-badge ${GP_MARK[gpRecipeLevel(r)][0]}">${GP_MARK[gpRecipeLevel(r)][1]} ${GP_MARK[gpRecipeLevel(r)][2]} avec un estomac lent</span></div>` : ''}
        <p style="font-size:14px;color:var(--ink-soft);line-height:1.45">${esc(r.note)}</p>
        <div class="chips">
          <span class="chip sage">${r.carbs} g glucides / part</span>
          <span class="chip">${igLabel(r.ig)} · ${r.ig}</span>
          <span class="chip">CG ${cg}</span>
          <span class="chip">${r.time} min</span>
          <span class="chip">${r.portions} parts</span>
        </div>
      </div>

      <div class="sect-head" style="margin-top:20px"><h3>Ce qu'il te faut</h3></div>
      ${r.ing.map((x, i) => `
        <button class="tick" data-tick="${i}">
          <span class="box"><svg><use href="#i-check"/></svg></span>
          <span class="tk-name">${esc(x[0])}</span>
          <span class="tk-qty">${esc(x[1])}</span>
        </button>`).join('')}

      <div class="sect-head" style="margin-top:22px"><h3>On y va</h3></div>
      <div class="card">
        ${r.steps.map((s, i) => `
          <div class="stepline">
            <span class="n">${i + 1}</span>
            <div class="txt">${esc(s[0])}
              <div><span class="t"><svg><use href="#i-clock"/></svg> ${s[1]} min</span></div>
            </div>
          </div>`).join('')}
      </div>

      <button class="btn btn-sage btn-block btn-lg" id="btnEat" style="margin-top:18px">
        🍽️ Passer à table !
      </button>
      <p class="foot-note">« Passer à table » enregistre directement une part dans ton journal — pas besoin de photo.</p>
    </div>`;

  $$('#recipeOut [data-tick]').forEach(b => b.addEventListener('click', () => b.classList.toggle('on')));
  $('#btnEat').addEventListener('click', () => {
    addMeal({ icon:'🍽️', name: r.title, carbs: r.carbs, ig: r.ig, src:'recette' });
    toast('Une part enregistrée. Bon appétit !');
    go('home');
    say(`<b>${esc(r.title)}</b> — noté. ${r.ig < 56 ? 'IG bas, la montée sera toute douce.' : 'Régale-toi.'}`, 'proud', 8000);
  });
  $('#recipeOut').scrollIntoView({ behavior:'smooth', block:'start' });
}
$('#btnRecipe').addEventListener('click', findRecipe);
$('#recipeInput').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) findRecipe();
});

/* ==========================================================================
   11. SCANNER DE CARTE — Claude + recherche web, dictionnaire local en secours
   ========================================================================== */
const DEMO_MENU = `Burrata, tomates anciennes
Risotto aux champignons
Tartare de bœuf, frites maison
Dos de cabillaud, écrasé de céleri
Tiramisu maison
Crème brûlée à la vanille`;

$('#menuDemo').addEventListener('click', () => { $('#menuInput').value = DEMO_MENU; scanMenu(); });

/* Repli hors ligne : le dictionnaire des 24 familles de plats */
function localMatch(line) {
  const n = normalize(line);
  for (const d of MENU_DB) if (d.k.some(k => n.includes(normalize(k)))) return { line, c: d.c, ig: d.ig, tip: d.tip };
  return { line, c: 30, ig: 50, tip: 'Plat non reconnu : estimation moyenne, ajuste selon ce que tu vois arriver.' };
}

/* [C] Analyse par Claude, avec recherche web si le restaurant est nommé */
async function menuAI(lines, place) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 70000);
  const prompt = `Tu aides une personne diabétique à lire la carte d'un restaurant.
${place
    ? `Restaurant : ${place}. Cherche sa carte en ligne pour retrouver la composition réelle des plats, les accompagnements et les portions servies. Si tu ne trouves rien de fiable, dis-le dans "note" et estime à partir des intitulés.`
    : `Aucun restaurant précisé : estime à partir des intitulés seuls.`}

${lines.length
    ? `Plats à analyser, dans cet ordre :\n${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}`
    : `Aucune liste fournie : retrouve la carte du restaurant et analyse ses 8 plats les plus représentatifs (entrées, plats, desserts).`}

Contexte de la journée de la personne : ${dayContext()}

Réponds UNIQUEMENT par un objet JSON valide, sans texte autour et sans balises Markdown :
{"plats":[{"nom":"intitulé repris tel quel","glucides":45,"ig":60,"astuce":"une phrase courte"}],"choix":"intitulé du plat le plus doux pour la glycémie","note":"une phrase"}
Règles :
- Si une liste est fournie, garde exactement le même nombre de plats et le même ordre.
- "glucides" : grammes de glucides d'une portion telle qu'elle est servie au restaurant, accompagnement compris.
- "ig" : indice glycémique du plat entier, 0 s'il n'apporte pas de glucides.
- "astuce" : 20 mots maximum, tutoiement, concrète et utile. Jamais culpabilisante, jamais de dose d'insuline ni de consigne médicale.
- "note" : une phrase bienveillante qui tient compte de la journée déjà écoulée, sans jamais interdire un plat.`;

  try {
    const r = await fetch(aiURL(), {
      method: 'POST',
      headers: aiHeaders(),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: VISION.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
        tools: place ? [{ type: 'web_search_20250305', name: 'web_search' }] : undefined
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = pickJSON(await r.json());
    const rows = (j.plats || []).filter(p => p && p.nom).slice(0, 14).map((p, i) => ({
      line: String(p.nom).slice(0, 90) || lines[i],
      c: clamp(Math.round(+p.glucides || 0), 0, 250),
      ig: clamp(Math.round(+p.ig || 0), 0, 110),
      tip: String(p.astuce || '').slice(0, 160)
    }));
    if (!rows.length) throw new Error('vide');
    return { rows, best: j.choix ? String(j.choix).slice(0, 90) : null, note: j.note ? String(j.note).slice(0, 220) : null };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(to);
  }
}

let menuTimer = null;
async function scanMenu() {
  const lines = $('#menuInput').value.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 14);
  const place = $('#menuPlace').value.trim();
  if (!lines.length && !place) {
    $('#menuOut').innerHTML = `<div class="empty"><strong>La carte est vide</strong>Écris les plats un par ligne, ou donne le nom du restaurant.</div>`;
    return;
  }

  const steps = place
    ? ['Lecture de la carte…', `Recherche en ligne : ${place}…`, 'Composition des plats…', 'Estimation des glucides…']
    : ['Lecture de la carte…', 'Estimation des glucides…', 'Comparaison des plats…'];
  $('#menuOut').innerHTML = `<div class="scan"><div class="scan-ring"></div><div class="scan-step" id="menuStep">${esc(steps[0])}</div></div>`;
  let si = 0;
  clearInterval(menuTimer);
  menuTimer = setInterval(() => {
    si = (si + 1) % steps.length;
    const el = $('#menuStep');
    if (el) el.textContent = steps[si];
  }, 900);

  const ai = await menuAI(lines, place);
  clearInterval(menuTimer);

  if (ai) renderMenu(ai.rows, place ? 'web' : 'ai', ai.best, ai.note);
  else if (lines.length) renderMenu(lines.map(localMatch), 'local', null, null);
  else $('#menuOut').innerHTML = `<div class="empty"><strong>Carte introuvable en ligne</strong>Écris les plats à la main, une ligne par plat.</div>`;
}

const MENU_BADGE = {
  web:   { c:'sage',   t:'Carte retrouvée en ligne' },
  ai:    { c:'violet', t:'Estimé par Claude' },
  local: { c:'peach',  t:'Dictionnaire local' }
};

function renderMenu(rows, src, best, note) {
  const b = MENU_BADGE[src];
  const pick = best && rows.some(r => normalize(r.line).includes(normalize(best.slice(0, 20))))
    ? best
    : rows.reduce((a, r) => (r.ig * r.c < a.ig * a.c ? r : a)).line;

  $('#menuOut').innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px">
      <span class="eyebrow">${rows.length} plat${rows.length > 1 ? 's' : ''} analysé${rows.length > 1 ? 's' : ''}</span>
      <span class="chip ${b.c}">${b.t}</span>
    </div>
    ${rows.map((r, i) => {
      const cls = r.ig < 45 ? 'bg-sage' : r.ig < 66 ? 'bg-peach' : 'bg-terra';
      const face = r.ig < 45 ? '🌿' : r.ig < 66 ? '🙂' : '⚡';
      return `<div class="dish" style="animation-delay:${i * 40}ms">
        <span class="verdict ${cls}">${face}</span>
        <div class="dish-body">
          <div class="dish-name">${esc(r.line)}</div>
          <div class="dish-tip">≈ ${r.c} g de glucides · ${igLabel(r.ig)}${r.tip ? ' — ' + esc(r.tip) : ''}</div>
        </div>
        <button class="dish-add" data-dish="${i}" aria-label="Ajouter ${esc(r.line)} au journal"><svg><use href="#i-plus"/></svg></button>
      </div>`;
    }).join('')}
    <div class="glycia-note" style="margin-top:14px">
      <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('happy')}</div>
      <div><span class="who">GlycIA —</span> ${note
        ? esc(note) + ` Le plus doux pour ta glycémie : « ${esc(pick)} ».`
        : `Si tu veux le choix le plus doux pour ta glycémie, je partirais sur « ${esc(pick)} ». Mais tu es au restaurant : si l'envie te porte ailleurs, prends-le, on ajustera.`}</div>
    </div>`;

  $$('#menuOut [data-dish]').forEach(btn => btn.addEventListener('click', () => {
    const r = rows[+btn.dataset.dish];
    addMeal({ icon:'🍽️', name: r.line, carbs: r.c, ig: r.ig, src:'menu' });
    toast('Plat ajouté au journal');
  }));
}
$('#btnMenuScan').addEventListener('click', scanMenu);

/* ==========================================================================
   12. PART DU GÂTEAU
   ========================================================================== */

let cakeSel = 0;

$('#cakePresets').innerHTML = CAKE_PRESETS.map((p, i) =>
  `<button data-cake="${i}" class="${i === 0 ? 'on' : ''}">${p.e} ${esc(p.n)}</button>`).join('');
$$('#cakePresets [data-cake]').forEach(b => b.addEventListener('click', () => {
  cakeSel = +b.dataset.cake;
  $$('#cakePresets button').forEach(x => x.classList.toggle('on', x === b));
  $('#cakeTotal').value = CAKE_PRESETS[cakeSel].c;
  paintCake();
}));

const CAKE_C = 2 * Math.PI * 46;
function paintCake() {
  const tot = +$('#cakeTotal').value;
  const parts = +$('#cakeParts').value;
  const mine = clamp(+$('#cakeMine').value, 1, parts);
  $('#cakeMine').max = parts;
  $('#cakeMine').value = mine;

  const per = tot / parts, my = per * mine;
  const p = CAKE_PRESETS[cakeSel];

  $('#cakeTotalV').textContent = tot;
  $('#cakePartsV').textContent = parts;
  $('#cakeMineV').textContent = mine;
  $('#cakeResult').textContent = round(my) + ' g';
  $('#cakeArc').style.strokeDashoffset = CAKE_C * (1 - mine / parts);
  $('#cakeNote').innerHTML = `Une part = <b>${round(per)} g</b> de glucides. Tu en prends ${mine} sur ${parts},
    soit <b>${round(my)} g</b> — ${igLabel(p.i).toLowerCase()}, charge glycémique ≈ ${round(my * p.i / 100)}.`;
}
['cakeTotal', 'cakeParts', 'cakeMine'].forEach(id => $('#' + id).addEventListener('input', paintCake));
$('#cakeAdd').addEventListener('click', () => {
  const tot = +$('#cakeTotal').value, parts = +$('#cakeParts').value, mine = +$('#cakeMine').value;
  const p = CAKE_PRESETS[cakeSel];
  addMeal({ icon:p.e, name:`${p.n} — ${mine}/${parts}`, carbs: tot / parts * mine, ig:p.i, src:'part' });
  closeModal($('#m-cake'));
  toast('Ta part est dans le journal');
  say('Une part, c\'est une part. Aucun problème 🙂', 'happy', 6000);
});
paintCake();

/* ==========================================================================
   14. BASE ALIMENTS
   Format compact : [nom, glucides/100 g, IG, kcal/100 g, poids portion g, libellé portion]
   Valeurs de composition moyennes (table CIQUAL, étiquetage fabricant 2026).
   ========================================================================== */

/* Extension de la bible — fusionnée dans FOODDB */

/* fusion */
Object.entries(FOODDB2).forEach(([c, l]) => { FOODDB[c] = (FOODDB[c] || []).concat(l); });

/* ---------- Index ---------- */
const CAT_ICON = {
  'Fast-food & sandwichs':'🍔','Plats préparés & cuisine maison':'🍲','Pains & viennoiseries':'🥖',
  'Féculents, céréales & légumineuses':'🍚','Fruits':'🍎','Légumes':'🥦',
  'Viandes, volailles & charcuterie':'🍗','Poissons & fruits de mer':'🐟',
  'Œufs, laitages & fromages':'🧀','Sucré, desserts & goûter':'🍰','Boissons':'🥤',
  'Sauces, matières grasses & apéro':'🫗','Cuisine du monde':'🌍',
  'Spécialités régionales françaises':'🇫🇷','Petit-déjeuner & tartines':'🥐',
  'Épicerie, farines & basiques':'🧂','Sans gluten, végétarien & spécifique':'🌱',
  'Sport & diététique':'💪','Trouvés en ligne':'🌐','Ajoutés par Claude':'✨'
};

const ALL = [];
const seenF = new Set();
Object.entries(FOODDB).forEach(([cat, list]) => list.forEach(a => {
  const key = normalize(a[0]);
  if (seenF.has(key)) return;
  seenF.add(key);
  ALL.push({ n:a[0], cat, c:a[1], ig:a[2], kcal:a[3], pw:a[4], pl:a[5], k:normalize(a[0] + ' ' + cat) });
}));

const CATS = Object.keys(FOODDB);
let fCat = null, fSort = 'az', fLimit = 40, fOpen = null, fq = '';
const fPort = {};
const cmp = [];
const tray = [];

$('#foodCats').innerHTML =
  `<button class="cat on" data-cat="">Tout (${ALL.length})</button>` +
  CATS.map(c => `<button class="cat" data-cat="${esc(c)}">${CAT_ICON[c] || '•'} ${esc(c.split(/[&,]/)[0].trim())}</button>`).join('');
bindCats();
function bindCats() {
  $$('#foodCats [data-cat]').forEach(b => { b.onclick = () => {
    fCat = b.dataset.cat || null; fLimit = 40; fOpen = null;
    $$('#foodCats .cat').forEach(x => x.classList.toggle('on', x === b));
    renderFoods();
  };});
}

$('#foodSort').addEventListener('click', () => {
  fSort = fSort === 'az' ? 'carb' : fSort === 'carb' ? 'kcal' : 'az';
  $('#foodSort').textContent = fSort === 'az' ? 'A → Z' : fSort === 'carb' ? 'Glucides ↑' : 'Calories ↑';
  renderFoods();
});

let offTimer = null;
$('#foodQ').addEventListener('input', e => {
  fq = normalize(e.target.value.trim());
  fLimit = 40; fOpen = null;
  $('#foodClear').style.display = e.target.value ? 'grid' : 'none';
  renderFoods();
  clearTimeout(offTimer);
  if (fq.length >= 3 && matchFoods().length < 6) offTimer = setTimeout(() => offSearch(fq), 700);
});
$('#foodClear').addEventListener('click', () => {
  $('#foodQ').value = ''; fq = ''; fLimit = 40;
  $('#foodClear').style.display = 'none';
  renderFoods(); $('#foodQ').focus();
});

/* ---------- [B] Recherche vocale ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) $('#foodMic').style.display = 'none';
let rec = null;
$('#foodMic').addEventListener('click', () => {
  if (!SR) return;
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false;
  $('#foodMic').classList.add('rec');
  rec.onresult = ev => {
    const txt = [...ev.results].map(r => r[0].transcript).join('');
    $('#foodQ').value = txt;
    $('#foodQ').dispatchEvent(new Event('input'));
  };
  rec.onerror = () => toast('Micro indisponible dans cet aperçu');
  rec.onend = () => { $('#foodMic').classList.remove('rec'); rec = null; };
  try { rec.start(); } catch (_) { rec = null; $('#foodMic').classList.remove('rec'); }
});

/* ---------- Open Food Facts : ~4 millions de produits ---------- */
function guessIG(txt, c, sug, fib) {
  if (!c) return 0;
  const t = normalize(txt);
  const R = [[/soda|cola|limonade|sirop|energy/, 65], [/jus|nectar/, 50],
    [/pain|baguette|biscotte|brioche|viennoiser|pizza|burger/, 70], [/riz/, 68],
    [/pate|spaghetti|nouille|macaroni/, 50], [/pomme de terre|frite|puree|chips/, 72],
    [/legume|salade|crudite/, 25], [/fruit|pomme|banane|orange/, 42],
    [/lait|yaourt|fromage|creme|laitier/, 32], [/chocolat|biscuit|gateau|bonbon|confiserie|dessert/, 60],
    [/lentille|pois|haricot|legumineuse|quinoa/, 32], [/viande|poisson|volaille|oeuf|charcuterie/, 0],
    [/cereale|muesli|avoine/, 55], [/noix|amande|graine/, 15]];
  let ig = 55;
  for (const [re, v] of R) if (re.test(t)) { ig = v; break; }
  if (sug && c && sug / c > .7) ig += 8;
  if (fib && fib > 6) ig -= 8;
  return clamp(Math.round(ig), 0, 100);
}

let offBusy = false;
async function offSearch(q) {
  if (offBusy) return;
  offBusy = true;
  const el = $('#foodOnline');
  if (el) el.innerHTML = `<div class="online-wait">Recherche parmi 4 millions de produits…</div>`;
  try {
    const url = 'https://world.openfoodfacts.org/cgi/search.pl?search_terms=' + encodeURIComponent(q)
      + '&search_simple=1&action=process&json=1&page_size=24'
      + '&fields=product_name_fr,product_name,brands,nutriments,serving_quantity,serving_size,categories';
    const r = await fetch(url);
    const d = await r.json();
    let added = 0;
    (d.products || []).forEach(p => {
      const nu = p.nutriments || {};
      const c = +nu.carbohydrates_100g;
      if (!isFinite(c)) return;
      let name = (p.product_name_fr || p.product_name || '').trim();
      if (!name) return;
      if (p.brands) name += ' — ' + String(p.brands).split(',')[0].trim();
      name = name.slice(0, 52);
      const key = normalize(name);
      if (seenF.has(key)) return;
      seenF.add(key);
      ALL.push({
        n: name, cat: 'Trouvés en ligne',
        c: clamp(round(c, 1), 0, 100),
        ig: guessIG(name + ' ' + (p.categories || ''), c, +nu.sugars_100g, +nu.fiber_100g),
        kcal: clamp(Math.round(+nu['energy-kcal_100g'] || 0), 0, 900),
        pw: clamp(Math.round(+p.serving_quantity || 100), 5, 900),
        pl: String(p.serving_size || '1 portion').slice(0, 22),
        k: normalize(name + ' trouves en ligne'), off: true
      });
      added++;
    });
    if (added && !CATS.includes('Trouvés en ligne')) {
      CATS.push('Trouvés en ligne');
      $('#foodCats').insertAdjacentHTML('beforeend', `<button class="cat" data-cat="Trouvés en ligne">🌐 En ligne</button>`);
      bindCats();
    }
    renderFoods(added ? `${added} produit${added > 1 ? 's' : ''} récupéré${added > 1 ? 's' : ''} depuis Open Food Facts` : 'Aucun produit trouvé en ligne');
  } catch (e) {
    const z = $('#foodOnline');
    if (z) z.innerHTML = `<div class="online-wait">Base mondiale injoignable depuis cet aperçu.</div>`;
  } finally { offBusy = false; }
}

/* ---------- Filtrage ---------- */
function matchFoods() {
  let out = ALL.filter(f => (!fCat || f.cat === fCat) && (!fq || f.k.includes(fq)));
  if (state.gp && gpFilter) out = out.filter(f => gpFilter === 1 ? gpLevel(f) === 1 : gpLevel(f) < 3);
  if (fq) out.sort((a, b) => (normalize(b.n).startsWith(fq) - normalize(a.n).startsWith(fq)) || a.n.localeCompare(b.n, 'fr'));
  else if (fSort === 'carb') out.sort((a, b) => a.c - b.c || a.n.localeCompare(b.n, 'fr'));
  else if (fSort === 'kcal') out.sort((a, b) => a.kcal - b.kcal || a.n.localeCompare(b.n, 'fr'));
  else out.sort((a, b) => a.n.localeCompare(b.n, 'fr'));
  return out;
}

const igCol = ig => ig < 56 ? 'var(--sage-deep)' : ig < 70 ? '#B4741C' : 'var(--terra-deep)';
const findFood = n => ALL.find(x => x.n === n);

function renderFoods(onlineMsg) {
  const res = matchFoods();
  $('#foodCount').textContent = res.length ? `${res.length} aliment${res.length > 1 ? 's' : ''}` : '';

  if (!res.length) {
    $('#foodList').innerHTML = `
      <div class="empty"><strong>Rien pour « ${esc($('#foodQ').value)} »</strong>
      Ni dans mes ${ALL.length} aliments, ni en ligne. Claude peut aller chercher les valeurs.</div>
      <button class="btn btn-outline btn-block" id="offBtn" style="margin-top:10px">🌐 Chercher dans la base mondiale</button>
      <button class="btn btn-violet btn-block" id="askClaude" style="margin-top:8px">
        <svg><use href="#i-sparkle"/></svg> Demander à Claude</button>
      <div id="foodOnline"></div>`;
    $('#askClaude').onclick = askClaudeFood;
    $('#offBtn').onclick = () => offSearch(fq);
    renderBar();
    return;
  }

  const shown = res.slice(0, fLimit);
  $('#foodList').innerHTML = shown.map(f => {
    const mult = fPort[f.n] || 1;
    const g = Math.round(f.pw * mult);
    const carbs = round(f.c * g / 100, 1);
    const kcal = Math.round(f.kcal * g / 100);
    const cg = round(f.ig * carbs / 100);
    const inCmp = cmp.includes(f.n), inTray = tray.some(t => t.n === f.n);
    return `
    <div class="frow ${fOpen === f.n ? 'open' : ''}">
      <button class="fhead" data-food="${esc(f.n)}">
        ${state.gp ? `<span class="gp-bar ${GP_MARK[gpLevel(f)][0]}"></span>` : ''}
        <span class="fe">${f.off ? '🌐' : (CAT_ICON[f.cat] || '🍽️')}</span>
        <span class="fn"><b>${esc(f.n)}${state.gp ? `<span class="gp-badge ${GP_MARK[gpLevel(f)][0]}">${GP_MARK[gpLevel(f)][1]} ${GP_MARK[gpLevel(f)][2]}</span>` : ''}</b><span>${esc(f.pl)} · ${f.pw} g · ${igLabel(f.ig)}</span></span>
        <span class="fc"><b>${round(f.c * f.pw / 100)}</b><span>g gluc.</span></span>
      </button>
      <div class="fdet">
        <div class="fgrid">
          <div><b style="color:var(--peach-deep)">${carbs}</b><span>Glucides g</span></div>
          <div><b style="color:${igCol(f.ig)}">${f.ig || '—'}</b><span>Indice IG</span></div>
          <div><b style="color:var(--violet-deep)">${cg}</b><span>Charge CG</span></div>
        </div>
        <div class="fmeta">Pour 100 g : ${f.c} g de glucides · ${f.kcal} kcal &nbsp;|&nbsp; ici ${g} g · ${kcal} kcal</div>
        <div class="fport">
          <span class="lbl">${esc(f.pl)}</span>
          <div class="step">
            <button data-p="${esc(f.n)}" data-d="-1" aria-label="Moins">−</button>
            <span class="qty">${fmtQ(mult)}<small>portion${mult > 1 ? 's' : ''}</small></span>
            <button data-p="${esc(f.n)}" data-d="1" aria-label="Plus">+</button>
          </div>
        </div>
        <div class="fbtns">
          <button class="btn btn-outline ${inCmp ? 'act' : ''}" data-cmp="${esc(f.n)}">⚖️ ${inCmp ? 'Retirer' : 'Comparer'}</button>
          <button class="btn btn-outline ${inTray ? 'act' : ''}" data-tray="${esc(f.n)}">🍽️ ${inTray ? 'Retirer' : 'Plateau'}</button>
        </div>
        <button class="btn btn-primary btn-block" data-addfood="${esc(f.n)}" style="margin-top:8px">
          <svg><use href="#i-plus"/></svg> Ajouter au journal</button>
      </div>
    </div>`;
  }).join('')
  + (res.length > fLimit ? `<button class="btn btn-ghost btn-block" id="foodMore" style="margin-top:6px">Afficher ${Math.min(40, res.length - fLimit)} de plus</button>` : '')
  + `<div id="foodOnline">${onlineMsg ? `<div class="online-wait">🌐 ${esc(onlineMsg)}</div>` : ''}</div>`
  + (fq.length >= 3 ? `<button class="btn btn-outline btn-block" id="offBtn" style="margin-top:8px">🌐 Chercher « ${esc($('#foodQ').value)} » dans la base mondiale</button>` : '');

  $$('#foodList [data-food]').forEach(b => b.onclick = () => { fOpen = fOpen === b.dataset.food ? null : b.dataset.food; renderFoods(); });
  $$('#foodList [data-p]').forEach(b => b.onclick = e => {
    e.stopPropagation();
    const n = b.dataset.p;
    fPort[n] = clamp(round((fPort[n] || 1) + (+b.dataset.d) * .5, 1), .5, 8);
    renderFoods();
  });
  $$('#foodList [data-addfood]').forEach(b => b.onclick = () => addFoodToJournal(b.dataset.addfood));
  $$('#foodList [data-cmp]').forEach(b => b.onclick = () => {
    const n = b.dataset.cmp, i = cmp.indexOf(n);
    if (i >= 0) cmp.splice(i, 1);
    else { if (cmp.length >= 4) { toast('4 aliments maximum'); return; } cmp.push(n); }
    renderFoods();
  });
  $$('#foodList [data-tray]').forEach(b => b.onclick = () => {
    const n = b.dataset.tray, i = tray.findIndex(t => t.n === n);
    if (i >= 0) tray.splice(i, 1); else tray.push({ n, mult: fPort[n] || 1 });
    renderFoods();
  });
  const more = $('#foodMore');
  if (more) more.onclick = () => { fLimit += 40; renderFoods(); };
  const ob = $('#offBtn');
  if (ob) ob.onclick = () => offSearch(fq);
  renderBar();
}

function addFoodToJournal(name) {
  const f = findFood(name);
  const mult = fPort[f.n] || 1;
  addMeal({
    icon: f.off ? '🌐' : (CAT_ICON[f.cat] || '🍽️'),
    name: mult === 1 ? f.n : `${f.n} (${fmtQ(mult)} ${f.pl.replace(/^1 /, '')})`,
    carbs: f.c * f.pw * mult / 100, ig: f.ig, src: 'aliment'
  });
  toast(`${f.n} ajouté au journal`);
}

/* ---------- Barre flottante ---------- */
function renderBar() {
  const bar = $('#foodBar');
  if (!cmp.length && !tray.length) { bar.classList.remove('on'); bar.innerHTML = ''; return; }
  bar.classList.add('on');
  bar.innerHTML =
    (cmp.length ? `<button class="btn btn-violet" id="openCmp">⚖️ Comparer (${cmp.length})</button>` : '') +
    (tray.length ? `<button class="btn btn-sage" id="openTray">🍽️ Plateau (${tray.length})</button>` : '');
  if (cmp.length) $('#openCmp').onclick = openCmp;
  if (tray.length) $('#openTray').onclick = openTray;
}

/* ---------- [A] Comparateur ---------- */
function openCmp() {
  const list = cmp.map(findFood).filter(Boolean);
  if (!list.length) return;
  const rows = [
    ['Portion type', f => `${esc(f.pl)}<br><small>${f.pw} g</small>`],
    ['Glucides / portion', f => `<b style="color:var(--peach-deep)">${round(f.c * f.pw / 100)} g</b>`],
    ['Glucides / 100 g', f => `${f.c} g`],
    ['Indice glycémique', f => `<b style="color:${igCol(f.ig)}">${f.ig || '—'}</b><br><small>${igLabel(f.ig)}</small>`],
    ['Charge glycémique', f => `<b style="color:var(--violet-deep)">${round(f.ig * f.c * f.pw / 10000)}</b>`],
    ['Calories / portion', f => `${Math.round(f.kcal * f.pw / 100)} kcal`]
  ];
  const best = list.reduce((a, b) => (b.ig * b.c * b.pw < a.ig * a.c * a.pw ? b : a));
  $('#cmpBody').innerHTML = `
    <div class="cmp-wrap"><table class="cmp">
      <tr><th></th>${list.map(f => `<th>${CAT_ICON[f.cat] || '🍽️'}<br>${esc(f.n)}</th>`).join('')}</tr>
      ${rows.map(([lbl, fn]) => `<tr><td class="rl">${lbl}</td>${list.map(f => `<td>${fn(f)}</td>`).join('')}</tr>`).join('')}
    </table></div>
    <div class="glycia-note" style="margin-top:14px">
      <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('happy')}</div>
      <div><span class="who">GlycIA —</span> Sur ces ${list.length}, « ${esc(best.n)} » a la charge glycémique la plus basse.
      Les autres ne sont pas interdits pour autant : celui-là fait juste monter la courbe plus doucement.</div>
    </div>
    <div class="sheet-foot">
      <button class="btn btn-ghost" id="cmpClear">Vider</button>
      <button class="btn btn-primary" data-close>Fermer</button>
    </div>`;
  $('#cmpClear').onclick = () => { cmp.length = 0; closeModal($('#m-cmp')); renderFoods(); };
  openModal('cmp');
}

/* ---------- [C] Plateau ---------- */
function trayTotals() {
  let carbs = 0, kcal = 0, cg = 0;
  tray.forEach(t => {
    const f = findFood(t.n); if (!f) return;
    const c = f.c * f.pw * t.mult / 100;
    carbs += c; kcal += f.kcal * f.pw * t.mult / 100; cg += c * f.ig / 100;
  });
  return { carbs: Math.round(carbs), kcal: Math.round(kcal), cg: Math.round(cg), ig: carbs ? Math.round(cg / carbs * 100) : 0 };
}

function openTray() { renderTray(); openModal('tray'); }

function renderTray() {
  const t = trayTotals();
  $('#trayBody').innerHTML = `
    ${tray.map((it, i) => {
      const f = findFood(it.n); if (!f) return '';
      const g = Math.round(f.pw * it.mult);
      return `<div class="item">
        <span class="item-ico">${f.off ? '🌐' : (CAT_ICON[f.cat] || '🍽️')}</span>
        <div class="item-body">
          <div class="item-name">${esc(f.n)}</div>
          <div class="item-meta">${g} g · ${round(f.c * g / 100)} g de glucides · IG ${f.ig || '—'}</div>
        </div>
        <div class="step">
          <button data-tq="${i}" data-d="-1" aria-label="Moins">−</button>
          <span class="qty">${fmtQ(it.mult)}<small>×</small></span>
          <button data-tq="${i}" data-d="1" aria-label="Plus">+</button>
        </div>
      </div>`;
    }).join('')}
    <div class="recap">
      <div class="recap-grid">
        <div class="recap-cell"><div class="v" style="color:var(--peach-deep)">${t.carbs}</div><div class="k">Glucides</div><div class="h">grammes</div></div>
        <div class="recap-cell"><div class="v" style="color:${igCol(t.ig)}">${t.ig || '—'}</div><div class="k">IG moyen</div><div class="h">${igLabel(t.ig)}</div></div>
        <div class="recap-cell"><div class="v" style="color:var(--violet-deep)">${t.kcal}</div><div class="k">Calories</div><div class="h">kcal</div></div>
      </div>
    </div>
    <div class="sheet-foot">
      <button class="btn btn-ghost" id="trayFav">⭐ En faire un favori</button>
      <button class="btn btn-primary" id="trayAdd"><svg><use href="#i-check"/></svg> Au journal</button>
    </div>
    <button class="btn btn-outline btn-block" id="trayClear" style="margin-top:8px">Vider le plateau</button>`;

  $$('#trayBody [data-tq]').forEach(b => b.onclick = () => {
    const it = tray[+b.dataset.tq];
    it.mult = clamp(round(it.mult + (+b.dataset.d) * .5, 1), .5, 8);
    renderTray();
  });
  $('#trayAdd').onclick = () => {
    const tt = trayTotals();
    addMeal({ icon:'🍽️', name: trayName(), carbs: tt.carbs, ig: tt.ig, src:'aliment' });
    closeModal($('#m-tray')); tray.length = 0; renderFoods();
    toast('Repas complet ajouté au journal');
    say(`<b>${tt.carbs} g</b> pour ce plateau. ${tt.ig < 56 ? 'IG bas, la montée sera douce 🌿' : "C'est noté, sans jugement."}`, 'proud', 7000);
  };
  $('#trayFav').onclick = () => {
    const tt = trayTotals();
    FAVORITES.unshift({ icon:'🍽️', name: trayName(), carbs: tt.carbs, ig: tt.ig, tag:'Ton plateau' });
    renderFavorites();
    closeModal($('#m-tray')); tray.length = 0; renderFoods();
    toast('Enregistré dans tes favoris');
  };
  $('#trayClear').onclick = () => { tray.length = 0; closeModal($('#m-tray')); renderFoods(); };
}

function trayName() {
  const ns = tray.map(t => t.n.split(' —')[0]);
  return (ns.slice(0, 3).join(', ') + (ns.length > 3 ? ` +${ns.length - 3}` : '')).slice(0, 58);
}

/* ---------- Claude en dernier recours ---------- */
async function askClaudeFood() {
  const q = $('#foodQ').value.trim();
  if (!q) return;
  $('#foodList').innerHTML = `<div class="scan"><div class="scan-ring"></div><div class="scan-step">Recherche des valeurs de « ${esc(q)} »…</div></div>`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60000);
  try {
    const r = await fetch(aiURL(), {
      method:'POST', headers: aiHeaders(), signal: ctrl.signal,
      body: JSON.stringify({
        model: VISION.model, max_tokens: 1000,
        tools: [{ type:'web_search_20250305', name:'web_search' }],
        messages: [{ role:'user', content:`Valeurs nutritionnelles de « ${q} » (marché français, données récentes ; cherche en ligne si c'est un produit de marque ou d'enseigne).
Réponds UNIQUEMENT par un JSON valide, sans texte autour ni balises Markdown :
{"nom":"nom propre","emoji":"1 emoji","glucides_100g":25,"ig":55,"kcal_100g":250,"portion_g":150,"portion_label":"1 part"}
"ig" = indice glycémique estimé, 0 sans glucides.` }]
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = pickJSON(await r.json());
    const f = {
      n: String(j.nom || q).slice(0, 46), cat:'Ajoutés par Claude',
      c: clamp(+j.glucides_100g || 0, 0, 100),
      ig: clamp(Math.round(+j.ig || 0), 0, 110),
      kcal: clamp(Math.round(+j.kcal_100g || 0), 0, 900),
      pw: clamp(Math.round(+j.portion_g || 100), 5, 900),
      pl: String(j.portion_label || '1 portion').slice(0, 22)
    };
    f.k = normalize(f.n + ' ' + f.cat);
    ALL.push(f); seenF.add(normalize(f.n));
    if (!CATS.includes(f.cat)) {
      CATS.push(f.cat);
      $('#foodCats').insertAdjacentHTML('beforeend', `<button class="cat" data-cat="Ajoutés par Claude">✨ Claude</button>`);
      bindCats();
    }
    $('#foodQ').value = f.n; fq = normalize(f.n); fOpen = f.n;
    renderFoods(); toast(`${f.n} ajouté à la base`);
  } catch (e) {
    $('#foodList').innerHTML = `<div class="empty"><strong>Valeurs introuvables</strong>
      Claude n'est pas joignable depuis cet aperçu. Essaie un autre mot-clé.</div>`;
  } finally { clearTimeout(to); }
}

renderFoods();

/* ==========================================================================
   15. HISTORIQUE 7 JOURS — graphe SVG maison
   ========================================================================== */
const DAYNAME = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const PAST = [];

/* Répartit un total de glucides sur les 4 moments, pondéré comme une vraie journée type */
function splitByMoment(total, seed) {
  const w = [0.22 + (seed % 5) * .01, 0.34 - (seed % 3) * .01, 0.14 + (seed % 4) * .01, 0];
  w[3] = 1 - w[0] - w[1] - w[2];
  return { matin: Math.round(total * w[0]), midi: Math.round(total * w[1]), gouter: Math.round(total * w[2]), soir: Math.round(total * w[3]) };
}
function seedPast() {
  const base = [148, 172, 96, 205, 133, 161, 158, 121, 189, 143, 167, 102, 176, 155, 130, 198, 149, 168, 111, 182, 137, 160, 174, 128, 191, 146, 163];
  const igs  = [58, 63, 44, 68, 51, 57, 60, 47, 65, 55, 59, 45, 66, 56, 50, 69, 58, 61, 46, 67, 53, 58, 62, 49, 68, 54, 60];
  const n = base.length;
  for (let i = n; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const carbs = base[n - i], meals = 3 + (i % 2);
    PAST.push({ d, carbs, ig: igs[n - i], meals, byMoment: splitByMoment(carbs, i) });
  }
}

let weekSel = 6;
function renderWeek() {
  const today = { d: new Date(), carbs: totalCarbs(), ig: avgIg() || 0, meals: state.journal.length };
  const days = PAST.slice(-6).concat([today]);
  const max = Math.max(REPERE, ...days.map(x => x.carbs)) * 1.12;
  const W = 322, H = 132, bw = 30, gap = (W - 7 * bw) / 8;

  const bars = days.map((x, i) => {
    const h = Math.max(4, (x.carbs / max) * (H - 26));
    const px = gap + i * (bw + gap);
    const py = H - 22 - h;
    const col = x.carbs > REPERE ? '#FF8A65' : x.carbs > REPERE * .7 ? '#FFB74D' : '#81C784';
    const on = i === weekSel;
    return `<g class="wk" data-day="${i}" style="cursor:pointer">
      <rect x="${px - 3}" y="0" width="${bw + 6}" height="${H}" fill="transparent"/>
      <rect x="${px}" y="${py}" width="${bw}" height="${h}" rx="9"
            fill="${col}" opacity="${on ? 1 : .42}"/>
      ${on ? `<text x="${px + bw / 2}" y="${py - 6}" text-anchor="middle"
            font-size="11" font-weight="700" fill="#3B3733">${x.carbs}</text>` : ''}
      <text x="${px + bw / 2}" y="${H - 6}" text-anchor="middle" font-size="10.5"
            font-weight="${on ? 700 : 500}" fill="${on ? '#3B3733' : '#A9A199'}">${DAYNAME[x.d.getDay()]}</text>
    </g>`;
  }).join('');

  const ry = H - 22 - (REPERE / max) * (H - 26);
  const sel = days[weekSel];
  const avg = Math.round(days.reduce((s, x) => s + x.carbs, 0) / days.length);

  $('#weekChart').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Glucides des 7 derniers jours">
      <line x1="0" y1="${ry}" x2="${W}" y2="${ry}" stroke="#E5DFD2" stroke-width="1.5" stroke-dasharray="4 5"/>
      <text x="2" y="${ry - 5}" font-size="9" fill="#A9A199" font-weight="600">repère ${REPERE} g</text>
      ${bars}
    </svg>`;
  $('#weekInfo').innerHTML = `<b>${weekSel === 6 ? "Aujourd'hui" : sel.d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'short' })}</b>
    — ${sel.carbs} g de glucides${sel.meals ? `, ${sel.meals} repas` : ''}${sel.ig ? `, IG moyen ${sel.ig}` : ''}.`;
  $('#weekAvg').textContent = `${avg} g / jour en moyenne`;

  $$('#weekChart .wk').forEach(g => g.addEventListener('click', () => { weekSel = +g.dataset.day; renderWeek(); }));
}

/* ==========================================================================
   16. MODE RESTAURANT — géoloc puis cartes des restos autour
   ========================================================================== */
async function nearbyRestos() {
  const out = $('#restoOut');
  if (!navigator.geolocation) { out.innerHTML = `<div class="online-wait">Géolocalisation indisponible sur cet appareil.</div>`; return; }
  out.innerHTML = `<div class="online-wait">Localisation en cours…</div>`;

  let pos;
  try {
    pos = await new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000, maximumAge: 300000 }));
  } catch (e) {
    out.innerHTML = `<div class="online-wait">Position refusée ou indisponible. Tape le nom du restaurant à la main, ça marche aussi bien.</div>`;
    return;
  }

  const { latitude: la, longitude: lo } = pos.coords;
  out.innerHTML = `<div class="scan"><div class="scan-ring"></div><div class="scan-step">Restaurants autour de toi…</div></div>`;

  try {
    const r = await fetch(aiURL(), {
      method:'POST', headers: aiHeaders(),
      body: JSON.stringify({
        model: VISION.model, max_tokens: 1000,
        tools: [{ type:'web_search_20250305', name:'web_search' }],
        messages: [{ role:'user', content:`Cherche en ligne les restaurants ouverts au public situés à moins de 800 mètres du point GPS ${la.toFixed(5)}, ${lo.toFixed(5)} (France).
Réponds UNIQUEMENT par un JSON valide, sans texte autour ni balises Markdown :
{"ville":"nom de la commune","restos":[{"nom":"nom exact","type":"cuisine en 2 mots","rue":"rue ou repère"}]}
6 restaurants maximum, variés (au moins une option légère si possible).` }]
      })
    });
    if (!r.ok) throw new Error('HTTP');
    const j = pickJSON(await r.json());
    const list = (j.restos || []).slice(0, 6);
    if (!list.length) throw new Error('vide');

    out.innerHTML = `<div class="eyebrow" style="margin:4px 0 9px">${esc(j.ville || 'Autour de toi')}</div>` +
      list.map((x, i) => `<button class="opt" data-resto="${i}">
        <span class="oi bg-violet">📍</span>
        <span class="ot"><strong>${esc(x.nom)}</strong><em>${esc(x.type || '')}${x.rue ? ' · ' + esc(x.rue) : ''}</em></span>
      </button>`).join('');

    $$('#restoOut [data-resto]').forEach(b => b.onclick = () => {
      const x = list[+b.dataset.resto];
      $('#menuPlace').value = x.nom + (j.ville ? ', ' + j.ville : '');
      $('#menuInput').value = '';
      scanMenu();
    });
  } catch (e) {
    out.innerHTML = `<div class="online-wait">Impossible de récupérer les restaurants depuis cet aperçu. Le champ « nom du restaurant » fonctionne toujours.</div>`;
  }
}
$('#btnResto').addEventListener('click', nearbyRestos);


/* ==========================================================================
   17. GASTROPARÉSIE
   Vidange gastrique ralentie — 2e cause : le diabète ancien (atteinte du nerf vague).
   Repères diététiques consensuels : fractionner, pauvre en fibres, pauvre en graisses,
   textures liquides/semi-liquides en crise. Ne remplace aucun suivi médical.
   ========================================================================== */




/* [nom, 1=bien toléré / 2=avec prudence / 3=à éviter, raison] */






/* ---------- Rendu ---------- */
let gpPhase = 3, gpLvl = 0, gpQ = '';
const GP_LVL = { 1:['ok','Bien toléré'], 2:['mid','Avec prudence'], 3:['no','À éviter'] };

function renderGastro() {
  $('#gpPhases').innerHTML = GP_PHASES.map(p => `
    <button class="gp-ph ${gpPhase === p.id ? 'on' : ''}" data-ph="${p.id}">
      <span class="e">${p.e}</span><b>${esc(p.t)}</b><span class="s">${esc(p.s)}</span>
    </button>`).join('');
  $$('#gpPhases [data-ph]').forEach(b => b.onclick = () => { gpPhase = +b.dataset.ph; renderGastro(); });

  const p = GP_PHASES.find(x => x.id === gpPhase);
  $('#gpPhaseCard').innerHTML = `
    <p style="font-size:14.5px;line-height:1.5;color:var(--ink)">${esc(p.d)}</p>
    <div class="gp-ex">${p.ex.map(x => `<span>${esc(x)}</span>`).join('')}</div>
    <div class="glycia-note" style="margin-top:14px">
      <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('care')}</div>
      <div><span class="who">GlycIA —</span> ${esc(p.note)}</div>
    </div>`;

  $('#gpTips').innerHTML = GP_TIPS.map(([e, t, d]) => `
    <div class="gp-tip"><span class="e">${e}</span><div><b>${esc(t)}</b><p>${esc(d)}</p></div></div>`).join('');

  renderGpFoods();

  $('#gpRecipes').innerHTML = GP_RECIPES.map((r, i) => `
    <div class="frow ${gpOpenR === i ? 'open' : ''}">
      <button class="fhead" data-gpr="${i}">
        <span class="fe">${GP_PHASES.find(x => x.id === r.ph).e}</span>
        <span class="fn"><b>${esc(r.t)}</b><span>Phase ${r.ph} · ${r.min} min · ${igLabel(r.ig)}</span></span>
        <span class="fc"><b>${r.c}</b><span>g gluc.</span></span>
      </button>
      <div class="fdet">
        <div class="fgrid">
          <div><b style="color:var(--peach-deep)">${r.c}</b><span>Glucides g</span></div>
          <div><b style="color:${igCol(r.ig)}">${r.ig || '—'}</b><span>Indice IG</span></div>
          <div><b style="color:var(--violet-deep)">${r.kcal}</b><span>kcal</span></div>
        </div>
        <div class="eyebrow" style="margin:4px 0 8px">Ingrédients</div>
        ${r.i.map(x => `<div class="gp-ing">${esc(x)}</div>`).join('')}
        <div class="eyebrow" style="margin:14px 0 8px">Préparation</div>
        ${r.s.map((x, k) => `<div class="stepline"><span class="n" style="background:var(--violet)">${k + 1}</span><div class="txt">${esc(x)}</div></div>`).join('')}
        <div class="glycia-note" style="margin:10px 0 12px">
          <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('happy')}</div>
          <div><span class="who">GlycIA —</span> ${esc(r.n)}</div>
        </div>
        <button class="btn btn-primary btn-block" data-gpeat="${i}">🍽️ Passer à table</button>
      </div>
    </div>`).join('');
  $$('#gpRecipes [data-gpr]').forEach(b => b.onclick = () => { gpOpenR = gpOpenR === +b.dataset.gpr ? -1 : +b.dataset.gpr; renderGastro(); });
  $$('#gpRecipes [data-gpeat]').forEach(b => b.onclick = () => {
    const r = GP_RECIPES[+b.dataset.gpeat];
    addMeal({ icon:'🥣', name: r.t, carbs: r.c, ig: r.ig, src:'recette' });
    toast('Ajouté au journal. Doucement, par petites bouchées.');
  });

  $('#gpAlert').innerHTML = GP_ALERT.map(x => `<li>${esc(x)}</li>`).join('');
  renderGpLog();
}
let gpOpenR = -1;

function renderGpFoods() {
  $('#gpLvls').innerHTML = [[0, 'Tout'], [1, '✅ Bien toléré'], [2, '⚠️ Prudence'], [3, '⛔ À éviter']]
    .map(([v, l]) => `<button class="cat ${gpLvl === v ? 'on' : ''}" data-gl="${v}">${l}</button>`).join('');
  $$('#gpLvls [data-gl]').forEach(b => b.onclick = () => { gpLvl = +b.dataset.gl; renderGpFoods(); });

  let n = 0;
  const html = Object.entries(GP_FOODS).map(([cat, list]) => {
    const rows = list.filter(([nm, lv]) =>
      (!gpLvl || lv === gpLvl) && (!gpQ || normalize(nm + ' ' + cat).includes(gpQ)));
    if (!rows.length) return '';
    n += rows.length;
    return `<div class="gp-cat">${esc(cat)}</div>` + rows.map(([nm, lv, why]) => `
      <div class="gp-f ${GP_LVL[lv][0]}">
        <span class="gp-dot"></span>
        <div><b>${esc(nm)}</b><p>${esc(why)}</p></div>
      </div>`).join('');
  }).join('');
  $('#gpFoods').innerHTML = html || `<div class="empty"><strong>Aucun aliment</strong>Change de filtre ou vide la recherche.</div>`;
  $('#gpCount').textContent = n ? `${n} aliment${n > 1 ? 's' : ''}` : '';
}

$('#gpQ').addEventListener('input', e => { gpQ = normalize(e.target.value.trim()); renderGpFoods(); });

/* ---------- Journal de tolérance ---------- */
const GP_FEEL = [['😊', 'Bien passé', 'ok'], ['😐', 'Lourdeur', 'mid'], ['🤢', 'Nausée', 'mid'], ['🤮', 'Vomissement', 'no']];
$('#gpFeel').innerHTML = GP_FEEL.map((f, i) => `<button class="gp-feel" data-feel="${i}"><span>${f[0]}</span>${f[1]}</button>`).join('');
$$('#gpFeel [data-feel]').forEach(b => b.onclick = () => {
  const f = GP_FEEL[+b.dataset.feel];
  const last = [...state.journal].sort((a, x) => x.time - a.time)[0];
  state.gpLog.unshift({ t: new Date(), f, meal: last ? last.name : 'hors repas' });
  if (state.gpLog.length > 40) state.gpLog.pop();
  renderGpLog();
  saveState();
  toast('Noté. C\'est ce journal qui fera ta liste personnelle.');
});

function renderGpLog() {
  if (!state.gpLog.length) {
    $('#gpLog').innerHTML = `<p class="foot-note" style="margin:6px 0 0">Rien de noté. Après chaque repas, un tap suffit — au bout de deux semaines tu sauras exactement ce qui passe chez toi.</p>`;
    return;
  }
  $('#gpLog').innerHTML = state.gpLog.slice(0, 12).map(l => `
    <div class="gp-f ${l.f[2]}" style="margin-bottom:6px">
      <span class="gp-dot"></span>
      <div><b>${l.f[0]} ${esc(l.f[1])}</b><p>${hhmm(l.t)} · ${esc(l.meal)}</p></div>
    </div>`).join('');
}

renderGastro();

/* ==========================================================================
   25. MODE RAMADAN — fractionnement inversé, repas nocturnes
   Structure identique au mode gastroparésie : un jeu de règles (phases + tips),
   un filtre (aliments par créneau), un jeu de recettes. Mode local à cette vue,
   sans filtrage global de l'appli (contrairement au mode gastroparésie).
   ========================================================================== */
let ramPhase = 1, ramLvl = 0, ramQ = '', ramOpenR = -1;
const RAM_LVL = { 1:['ok','Idéal'], 2:['mid','Avec modération'], 3:['no','Mieux éviter'] };

function renderRamadan() {
  $$('[data-ramsw]').forEach(el => { el.checked = state.ramadan; el.setAttribute('aria-checked', String(state.ramadan)); });

  $('#ramPhases').innerHTML = RAMADAN_PHASES.map(p => `
    <button class="gp-ph ${ramPhase === p.id ? 'on' : ''}" data-ramph="${p.id}">
      <span class="e">${p.e}</span><b>${esc(p.t)}</b><span class="s">${esc(p.s)}</span>
    </button>`).join('');
  $$('#ramPhases [data-ramph]').forEach(b => b.onclick = () => { ramPhase = +b.dataset.ramph; renderRamadan(); });

  const p = RAMADAN_PHASES.find(x => x.id === ramPhase);
  $('#ramPhaseCard').innerHTML = `
    <p style="font-size:14.5px;line-height:1.5;color:var(--ink)">${esc(p.d)}</p>
    <div class="gp-ex">${p.ex.map(x => `<span>${esc(x)}</span>`).join('')}</div>
    <div class="glycia-note" style="margin-top:14px">
      <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('care')}</div>
      <div><span class="who">GlycIA —</span> ${esc(p.note)}</div>
    </div>`;

  $('#ramTips').innerHTML = RAMADAN_TIPS.map(([e, t, d]) => `
    <div class="gp-tip"><span class="e">${e}</span><div><b>${esc(t)}</b><p>${esc(d)}</p></div></div>`).join('');

  renderRamFoods();

  $('#ramRecipes').innerHTML = RAMADAN_RECIPES.map((r, i) => `
    <div class="frow ${ramOpenR === i ? 'open' : ''}">
      <button class="fhead" data-ramr="${i}">
        <span class="fe">${RAMADAN_PHASES.find(x => x.id === r.ph).e}</span>
        <span class="fn"><b>${esc(r.t)}</b><span>${r.ph === 1 ? 'Suhoor' : 'Iftar'} · ${r.min} min · ${igLabel(r.ig)}</span></span>
        <span class="fc"><b>${r.c}</b><span>g gluc.</span></span>
      </button>
      <div class="fdet">
        <div class="fgrid">
          <div><b style="color:var(--peach-deep)">${r.c}</b><span>Glucides g</span></div>
          <div><b style="color:${igCol(r.ig)}">${r.ig || '—'}</b><span>Indice IG</span></div>
          <div><b style="color:var(--violet-deep)">${r.kcal}</b><span>kcal</span></div>
        </div>
        <div class="eyebrow" style="margin:4px 0 8px">Ingrédients</div>
        ${r.i.map(x => `<div class="gp-ing">${esc(x)}</div>`).join('')}
        <div class="eyebrow" style="margin:14px 0 8px">Préparation</div>
        ${r.s.map((x, k) => `<div class="stepline"><span class="n" style="background:var(--violet)">${k + 1}</span><div class="txt">${esc(x)}</div></div>`).join('')}
        <div class="glycia-note" style="margin:10px 0 12px">
          <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('happy')}</div>
          <div><span class="who">GlycIA —</span> ${esc(r.n)}</div>
        </div>
        <button class="btn btn-primary btn-block" data-rameat="${i}">🍽️ Passer à table</button>
      </div>
    </div>`).join('');
  $$('#ramRecipes [data-ramr]').forEach(b => b.onclick = () => { ramOpenR = ramOpenR === +b.dataset.ramr ? -1 : +b.dataset.ramr; renderRamadan(); });
  $$('#ramRecipes [data-rameat]').forEach(b => b.onclick = () => {
    const r = RAMADAN_RECIPES[+b.dataset.rameat];
    addMeal({ icon: r.ph === 1 ? '🌙' : '🌆', name: r.t, carbs: r.c, ig: r.ig, src:'recette' });
    toast(r.ph === 1 ? 'Ajouté au journal. Bon suhoor.' : 'Ajouté au journal. Bon iftar.');
  });

  $('#ramAlert').innerHTML = RAMADAN_ALERT.map(x => `<li>${esc(x)}</li>`).join('');
}

function renderRamFoods() {
  $('#ramLvls').innerHTML = [[0,'Tout'], [1,'✅ Idéal'], [2,'⚠️ Modération'], [3,'⛔ À éviter']]
    .map(([v, l]) => `<button class="cat ${ramLvl === v ? 'on' : ''}" data-raml="${v}">${l}</button>`).join('');
  $$('#ramLvls [data-raml]').forEach(b => b.onclick = () => { ramLvl = +b.dataset.raml; renderRamFoods(); });

  let n = 0;
  const html = Object.entries(RAMADAN_FOODS).map(([cat, list]) => {
    const rows = list.filter(([nm, lv]) =>
      (!ramLvl || lv === ramLvl) && (!ramQ || normalize(nm + ' ' + cat).includes(ramQ)));
    if (!rows.length) return '';
    n += rows.length;
    return `<div class="gp-cat">${esc(cat)}</div>` + rows.map(([nm, lv, why]) => `
      <div class="gp-f ${RAM_LVL[lv][0]}">
        <span class="gp-dot"></span>
        <div><b>${esc(nm)}</b><p>${esc(why)}</p></div>
      </div>`).join('');
  }).join('');
  $('#ramFoods').innerHTML = html || `<div class="empty"><strong>Aucun aliment</strong>Change de filtre ou vide la recherche.</div>`;
  $('#ramCount').textContent = n ? `${n} aliment${n > 1 ? 's' : ''}` : '';
}
$('#ramQ').addEventListener('input', e => { ramQ = normalize(e.target.value.trim()); renderRamFoods(); });

function setRamadan(v) {
  state.ramadan = v;
  document.body.classList.toggle('ram-on', v);
  $$('[data-ramsw]').forEach(el => { el.checked = v; el.setAttribute('aria-checked', String(v)); });
  toast(v ? 'Mode Ramadan activé — GlycIA suit le fractionnement inversé' : 'Mode Ramadan désactivé');
  if (v) say('Mode Ramadan activé. Suhoor avant l\'aube, iftar au coucher du soleil : je m\'adapte au rythme inversé.', 'care', 9000);
  saveState();
}
$$('[data-ramsw]').forEach(el => el.addEventListener('change', () => setRamadan(el.checked)));

/* Recettes Ramadan surfaçables depuis la recherche de recettes générale (sans toucher au score gastroparésie) */
const RAM_AS_RECIPES = RAMADAN_RECIPES.map(r => ({
  key: ['ramadan', 'jeune', 'jeûne', ...(r.ph === 1 ? ['suhoor'] : ['iftar', 'rupture']), ...normalize(r.t).split(' ')],
  title: r.t, time: r.min, portions: 2, carbs: r.c, ig: r.ig,
  tag: (r.ph === 1 ? 'Suhoor' : 'Iftar') + ' — Ramadan', note: r.n,
  ing: r.i.map(x => { const m = x.match(/^(.*?)\s+([\d,.]+\s*\S*|\S+)$/); return m ? [m[1], m[2]] : [x, '']; }),
  steps: r.s.map(x => [x, Math.max(2, Math.round(r.min / r.s.length))])
}));
RECIPES.push(...RAM_AS_RECIPES);

renderRamadan();

/* ==========================================================================
   18. [A] SCAN CODE-BARRES + CACHE OPEN FOOD FACTS
   ========================================================================== */
const OFFCACHE = new Map();          // code-barres ou requête -> produit
let bdStream = null, bdLoop = null;

function offToFood(p, code) {
  const nu = p.nutriments || {};
  const c = +nu.carbohydrates_100g;
  if (!isFinite(c)) return null;
  let name = (p.product_name_fr || p.product_name || '').trim();
  if (!name) return null;
  if (p.brands) name += ' — ' + String(p.brands).split(',')[0].trim();
  name = name.slice(0, 52);
  return {
    n: name, cat: 'Trouvés en ligne', code,
    c: clamp(round(c, 1), 0, 100),
    ig: guessIG(name + ' ' + (p.categories || ''), c, +nu.sugars_100g, +nu.fiber_100g),
    kcal: clamp(Math.round(+nu['energy-kcal_100g'] || 0), 0, 900),
    pw: clamp(Math.round(+p.serving_quantity || 100), 5, 900),
    pl: String(p.serving_size || '1 portion').slice(0, 22),
    k: normalize(name + ' trouves en ligne'), off: true
  };
}

async function fetchBarcode(code) {
  if (OFFCACHE.has(code)) return OFFCACHE.get(code);
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`
    + '?fields=product_name_fr,product_name,brands,nutriments,serving_quantity,serving_size,categories');
  const d = await r.json();
  if (!d.product) throw new Error('inconnu');
  const f = offToFood(d.product, code);
  if (!f) throw new Error('sans valeurs');
  OFFCACHE.set(code, f);
  return f;
}

function pushFood(f) {
  const key = normalize(f.n);
  if (!seenF.has(key)) {
    seenF.add(key);
    ALL.push(f);
    if (!CATS.includes('Trouvés en ligne')) {
      CATS.push('Trouvés en ligne');
      $('#foodCats').insertAdjacentHTML('beforeend', `<button class="cat" data-cat="Trouvés en ligne">🌐 En ligne</button>`);
      bindCats();
    }
  }
  go('food');
  $('#foodQ').value = f.n; fq = normalize(f.n); fCat = null; fOpen = f.n; fLimit = 40;
  $$('#foodCats .cat').forEach((x, i) => x.classList.toggle('on', i === 0));
  renderFoods();
}

function stopBd() {
  clearInterval(bdLoop); bdLoop = null;
  if (bdStream) { bdStream.getTracks().forEach(t => t.stop()); bdStream = null; }
}

async function openScan() {
  openModal('scan');
  const body = $('#scanBody');
  if (!('BarcodeDetector' in window)) {
    body.innerHTML = `<div class="empty"><strong>Scanner indisponible</strong>
      Ce navigateur ne gère pas la lecture de codes-barres (Chrome et Android l'acceptent).
      Tu peux saisir le code à la main.</div>` + manualBox();
    bindManual();
    return;
  }
  body.innerHTML = `<div class="cam-wrap"><video id="bdVideo" playsinline autoplay muted></video>
      <div class="bd-frame"></div></div>
    <p class="foot-note" id="bdMsg">Vise le code-barres du paquet, bien à plat et éclairé.</p>` + manualBox();
  bindManual();
  try {
    const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
    bdStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
    const v = $('#bdVideo'); v.srcObject = bdStream; await v.play();
    bdLoop = setInterval(async () => {
      try {
        const codes = await det.detect(v);
        if (!codes.length) return;
        const code = codes[0].rawValue;
        stopBd();
        $('#bdMsg').textContent = 'Code ' + code + ' — recherche du produit…';
        await lookup(code);
      } catch (_) {}
    }, 450);
  } catch (e) {
    stopBd();
    body.innerHTML = `<div class="empty"><strong>Caméra bloquée</strong>
      Permission refusée ou aperçu intégré. Saisis le code à la main, ça marche aussi.</div>` + manualBox();
    bindManual();
  }
}

const manualBox = () => `
  <div class="searchbox" style="margin-top:12px">
    <svg><use href="#i-search"/></svg>
    <input id="bdManual" inputmode="numeric" placeholder="Code-barres à 13 chiffres">
  </div>
  <button class="btn btn-violet btn-block" id="bdGo" style="margin-top:10px">Chercher ce produit</button>`;

function bindManual() {
  $('#bdGo').onclick = () => {
    const c = $('#bdManual').value.replace(/\D/g, '');
    if (c.length < 8) { toast('Il manque des chiffres'); return; }
    lookup(c);
  };
}

async function lookup(code) {
  const cached = OFFCACHE.has(code);
  $('#scanBody').innerHTML = `<div class="scan"><div class="scan-ring"></div>
    <div class="scan-step">${cached ? 'Produit déjà en cache…' : 'Interrogation d\'Open Food Facts…'}</div></div>`;
  try {
    const f = await fetchBarcode(code);
    closeModal($('#m-scan'));
    pushFood(f);
    toast(`${f.n}${cached ? ' (cache)' : ''}`);
  } catch (e) {
    $('#scanBody').innerHTML = `<div class="empty"><strong>Produit introuvable</strong>
      Ce code n'est pas référencé, ou la base est injoignable depuis cet aperçu.</div>` + manualBox();
    bindManual();
  }
}

$('#btnScan').addEventListener('click', openScan);

/* ==========================================================================
   19. [C] PWA — Service Worker par Blob + manifeste, sans fichier annexe
   ========================================================================== */
(function pwa() {
  try {

    if (!('serviceWorker' in navigator) || location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    navigator.serviceWorker.register(new URL('./sw.js', import.meta.url)).catch(() => {});
  } catch (_) { /* aperçu sandboxé : on continue sans PWA */ }
})();

/* Bandeau hors-ligne */
(function net() {
  const b = document.createElement('div');
  b.className = 'offline';
  b.textContent = 'Hors ligne — la base locale et tes calculs fonctionnent toujours.';
  document.body.appendChild(b);
  const upd = () => b.classList.toggle('on', !navigator.onLine);
  addEventListener('online', upd); addEventListener('offline', upd); upd();
})();


/* ==========================================================================
   20. [A] MODE GASTROPARÉSIE GLOBAL
   Un moteur de règles classe les 1000+ aliments et les recettes par tolérance,
   au lieu de cantonner l'info à une section.
   ========================================================================== */
const GP_OVERRIDE = new Map();
Object.values(GP_FOODS).forEach(l => l.forEach(([n, lv]) => GP_OVERRIDE.set(normalize(n), lv)));

const GP_RED = /complet|cereale|granola|muesli|graine|noix|amande|pistache|cajou|noisette|pecan|macadamia|cacahuete|mais|pop-?corn|seche|sec$|cru$|crudite|chou|brocoli|poireau|celeri|fenouil|salade|artichaut|asperge|lentille|haricot|feve|legumineuse|pois chiche|petits pois|flageolet|frit|pane|nugget|chips|frite|saucisse|chorizo|salami|saucisson|lardon|bacon|rillette|confit|beignet|churros|donut|baguette|seigle|son d|kiwi|raisin|cerise|ananas|mangue|agrume|orange|clementine|pamplemousse|figue|datte|pruneau|abricot sec|framboise|mure|groseille|myrtille|cassis|gazeu|soda|cola|limonade|biere|alcool|^vin |whisky|vodka|rhum|pastis|champagne|cidre|mojito|spritz|kebab|tacos|burger|pizza|steak|entrecote|rumsteck|cordon bleu|brochette|poulpe|calamar|seiche|moule|huitre|crevette|chewing/;

const GP_GREEN = /puree|veloute|soupe|bouillon|compote|mixe|lisse|yaourt|fromage blanc|skyr|petit-suisse|faisselle|flan|creme dessert|riz au lait|semoule|banane|pain de mie|biscotte|boudoir|oeuf|œuf|omelette|cabillaud|colin|merlan|eglefin|sole|blanc de poulet|escalope de dinde|jambon blanc|jambon de dinde|tofu soyeux|^lait|sorbet|gelee|miel|sirop d|jus |the |infusion|^eau|polenta|gnocchi|melon|pot au feu/;

const GP_CAT = {
  'Boissons':1, 'Œufs, laitages & fromages':1, 'Poissons & fruits de mer':1,
  'Légumes':2, 'Fruits':2, 'Pains & viennoiseries':2, 'Sucré, desserts & goûter':2,
  'Féculents, céréales & légumineuses':2, 'Viandes, volailles & charcuterie':2,
  'Plats préparés & cuisine maison':2, 'Petit-déjeuner & tartines':2,
  'Épicerie, farines & basiques':2, 'Sans gluten, végétarien & spécifique':2,
  'Sport & diététique':2, 'Trouvés en ligne':2, 'Ajoutés par Claude':2,
  'Fast-food & sandwichs':3, 'Sauces, matières grasses & apéro':3,
  'Cuisine du monde':3, 'Spécialités régionales françaises':3
};

/* Lipides estimés pour 100 g : ce qui reste des calories une fois les glucides
   et une protéine forfaitaire retirés. Grossier, mais le gras est LE facteur
   qui ralentit la vidange, il faut bien le capter. */
function gpLevel(f) {
  if (f._gp) return f._gp;
  const k = normalize(f.n);
  let lv = null;
  for (const [ref, v] of GP_OVERRIDE) { if (k.includes(ref) || ref.includes(k)) { lv = v; break; } }
  if (lv === null) {
    lv = GP_CAT[f.cat] || 2;
    if (GP_GREEN.test(k)) lv = 1;
    if (GP_RED.test(k)) lv = 3;
    const fat = Math.max(0, (f.kcal || 0) - (f.c || 0) * 4 - 60) / 9;
    if (fat > 20) lv = 3;
    else if (fat > 12) lv = Math.max(lv, 2);
  }
  f._gp = lv;
  return lv;
}
const GP_MARK = { 1:['ok','✅','Bien toléré'], 2:['mid','⚠️','Avec prudence'], 3:['no','⛔','À éviter'] };

/* ---------- Bascule globale ---------- */
let gpFilter = 0;
function setGp(v) {
  state.gp = v;
  document.body.classList.toggle('gp-on', v);
  $$('[data-gpsw]').forEach(el => { el.checked = v; el.setAttribute('aria-checked', String(v)); });
  renderFoods();
  if (state.recipe) renderRecipe(state.recipe, false);
  toast(v ? 'Mode gastroparésie activé — tout est filtré par tolérance' : 'Mode gastroparésie désactivé');
  if (v) say('Mode gastroparésie activé. Je marque chaque aliment et chaque recette selon ce que ton estomac supportera.', 'care', 9000);
}
$$('[data-gpsw]').forEach(el => el.addEventListener('change', () => setGp(el.checked)));

/* ---------- Filtres tolérance dans la liste d'aliments ---------- */
$('#gpFilters').innerHTML = [[0,'Tout'],[1,'✅ Seulement bien toléré'],[2,'Sans les ⛔']]
  .map(([v,l]) => `<button class="cat ${gpFilter===v?'on':''}" data-gf="${v}">${l}</button>`).join('');
function bindGpFilters() {
  $$('#gpFilters [data-gf]').forEach(b => b.onclick = () => {
    gpFilter = +b.dataset.gf;
    $$('#gpFilters .cat').forEach(x => x.classList.toggle('on', x === b));
    fLimit = 40; renderFoods();
  });
}
bindGpFilters();

/* ---------- Recettes : niveau déduit des ingrédients ---------- */
function gpRecipeLevel(r) {
  if (r._gp) return r._gp;
  if (r.ph) { r._gp = 1; return 1; }
  const txt = normalize(r.title + ' ' + r.ing.map(x => x[0]).join(' '));
  let lv = 1;
  txt.split(/[,;]| et | avec /).forEach(part => {
    const p = part.trim(); if (!p) return;
    if (GP_RED.test(p)) lv = 3;
    else if (lv < 2 && !GP_GREEN.test(p)) lv = Math.max(lv, 2);
  });
  r._gp = lv;
  return lv;
}

/* Les recettes gastro rejoignent le moteur de recherche quand le mode est actif */
const GP_AS_RECIPES = GP_RECIPES.map(r => ({
  key: ['gastroparesie','mixe','lisse','veloute','purée','estomac','nausee','doux', ...normalize(r.t).split(' ')],
  title: r.t, time: r.min, portions: 2, carbs: r.c, ig: r.ig, ph: r.ph,
  tag: 'Phase ' + r.ph + ' — gastroparésie', note: r.n,
  ing: r.i.map(x => { const m = x.match(/^(.*?)\s+([\d,.]+\s*\S*|\S+)$/); return m ? [m[1], m[2]] : [x, '']; }),
  steps: r.s.map(x => [x, Math.max(2, Math.round(r.min / r.s.length))])
}));
RECIPES.push(...GP_AS_RECIPES);


/* ==========================================================================
   21. DÉPLOIEMENT AUTONOME
   Hors de l'aperçu Claude, deux choses manquent : la clé API (injectée
   automatiquement dans l'artifact) et la persistance. On les ajoute ici.
   ========================================================================== */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} }
};

const getKey   = () => store.get('glycia.key') || '';
const getProxy = () => store.get('glycia.proxy') || '';
const hasAI    = () => !!(getKey() || getProxy());

/* Proxy prioritaire : la clé reste alors côté serveur et ne transite jamais par le navigateur. */
const aiURL = () => getProxy() || 'https://api.anthropic.com/v1/messages';

function aiHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (getProxy()) return h;
  const k = getKey();
  if (k) {
    h['x-api-key'] = k;
    h['anthropic-version'] = '2023-06-01';
    h['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  return h;
}

/* ---------- Persistance ---------- */
const dayKey = d => d.toISOString().slice(0, 10);

function saveState() {
  store.set('glycia.data', JSON.stringify({
    day: dayKey(new Date()),
    journal: state.journal.map(m => ({ ...m, time: m.time.toISOString() })),
    favorites: FAVORITES,
    gp: state.gp,
    ramadan: state.ramadan,
    past: PAST.map(p => ({ d: p.d.toISOString(), carbs: p.carbs, ig: p.ig, meals: p.meals, byMoment: p.byMoment })),
    gpLog: state.gpLog.map(l => ({ t: l.t.toISOString(), f: l.f, meal: l.meal }))
  }));
}

function loadState() {
  const raw = store.get('glycia.data');
  if (!raw) return false;
  try {
    const o = JSON.parse(raw);
    if (o.favorites && o.favorites.length) { FAVORITES.length = 0; FAVORITES.push(...o.favorites); }
    if (o.past && o.past.length) { PAST.length = 0; PAST.push(...o.past.map(p => ({ ...p, d: new Date(p.d) }))); }
    if (o.gpLog && o.gpLog.length) { state.gpLog.length = 0; state.gpLog.push(...o.gpLog.map(l => ({ ...l, t: new Date(l.t) }))); }

    if (o.day === dayKey(new Date())) {
      state.journal = (o.journal || []).map(m => ({ ...m, time: new Date(m.time) }));
    } else if (o.journal && o.journal.length) {
      /* nouveau jour : la veille bascule dans l'historique */
      const c = o.journal.reduce((s, m) => s + m.carbs, 0);
      const num = o.journal.reduce((s, m) => s + m.ig * m.carbs, 0);
      const byMoment = { matin: 0, midi: 0, gouter: 0, soir: 0 };
      o.journal.forEach(m => { byMoment[momentOf(new Date(m.time).getHours())] += m.carbs; });
      PAST.push({ d: new Date(o.day + 'T12:00:00'), carbs: c, ig: c ? Math.round(num / c) : 0, meals: o.journal.length, byMoment });
      while (PAST.length > 28) PAST.shift();
      state.journal = [];
    }
    if (o.gp) setTimeout(() => setGp(true), 0);
    if (o.ramadan) setTimeout(() => setRamadan(true), 0);
    return true;
  } catch (_) { return false; }
}

/* ---------- Réglages ---------- */
function renderSettings() {
  const k = getKey(), px = getProxy();
  $('#setBody').innerHTML = `
    <div class="card">
      <div style="font-size:13.5px;color:var(--ink-soft);line-height:1.5;margin-bottom:14px">
        Analyse photo, décryptage de carte, aliment inconnu et restos alentour appellent Claude.
        Le reste — ${ALL.length} aliments, calculs, recettes, gastroparésie, SOS hypo — fonctionne
        sans rien configurer, hors ligne compris.
      </div>

      <div class="eyebrow" style="margin-bottom:8px">Option 1 — Proxy <span class="chip sage" style="margin-left:6px">recommandé</span></div>
      <div class="searchbox">
        <svg><use href="#i-search"/></svg>
        <input id="apiProxy" type="url" autocomplete="off" inputmode="url"
               placeholder="https://glycia-proxy.<toi>.workers.dev" value="${esc(px)}">
      </div>
      <p class="foot-note" style="text-align:left;margin:8px 0 18px">
        La clé reste sur le serveur, jamais dans le navigateur. Le dossier <code>worker/</code> du dépôt
        contient le Cloudflare Worker à déployer, gratuit et en trois commandes.
      </p>

      <div class="eyebrow" style="margin-bottom:8px">Option 2 — Clé directe</div>
      <div class="searchbox">
        <svg><use href="#i-search"/></svg>
        <input id="apiKey" type="password" autocomplete="off" placeholder="sk-ant-..." value="${esc(k)}">
      </div>
      <p class="foot-note" style="text-align:left;margin-top:8px">
        <b>Attention.</b> La clé reste dans le stockage de ce navigateur et n'est envoyée qu'à
        api.anthropic.com, mais tout script de la page peut la lire. À réserver à ton propre appareil.
        Si tu partages l'URL, prends l'option 1.
      </p>
      ${px ? '<p class="foot-note" style="text-align:left;color:var(--sage-deep)"><b>Proxy actif :</b> la clé directe est ignorée.</p>' : ''}
      <div class="sheet-foot">
        <button class="btn btn-ghost" id="keyDel">Tout effacer</button>
        <button class="btn btn-primary" id="keySave"><svg><use href="#i-check"/></svg> Enregistrer</button>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="sect-head"><h3 style="font-size:17px">Rappels de repas</h3></div>
      <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.45;margin-bottom:12px">
        Une notification aux heures de repas, avec tes favoris en actions rapides. Rien ne part sur un serveur.
      </p>
      <label class="sw">
        <span class="tool-ico bg-peach" style="width:42px;height:42px;border-radius:13px;display:grid;place-content:center">🔔</span>
        <span class="swt"><b>Activer les rappels</b><span>Petit-déj, déjeuner, goûter, dîner</span></span>
        <input type="checkbox" id="remindSw" role="switch" aria-checked="false">
      </label>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="sect-head"><h3 style="font-size:17px">Tes données</h3></div>
      <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.45">
        Journal, favoris et historique sont enregistrés dans ce navigateur uniquement. Rien ne part sur un serveur.
      </p>
      <button class="btn btn-outline btn-block" id="wipe" style="margin-top:12px">Tout effacer</button>
    </div>`;

  const remindSw = $('#remindSw');
  remindSw.checked = store.get('glycia.reminders') === '1';
  remindSw.setAttribute('aria-checked', String(remindSw.checked));
  remindSw.onchange = async () => {
    const ok = await setReminders(remindSw.checked);
    if (!ok) remindSw.checked = false;
    remindSw.setAttribute('aria-checked', String(remindSw.checked));
  };

  $('#keySave').onclick = () => {
    const v = $('#apiKey').value.trim(), u = $('#apiProxy').value.trim();
    if (u && !/^https:\/\//.test(u)) { toast('Le proxy doit être en https://'); return; }
    if (v) store.set('glycia.key', v); else store.del('glycia.key');
    if (u) store.set('glycia.proxy', u); else store.del('glycia.proxy');
    closeModal($('#m-set'));
    toast(hasAI() ? (u ? 'Proxy enregistré — les fonctions IA sont actives' : 'Clé enregistrée — les fonctions IA sont actives') : 'Configuration effacée');
  };
  $('#keyDel').onclick = () => {
    store.del('glycia.key'); store.del('glycia.proxy');
    $('#apiKey').value = ''; $('#apiProxy').value = '';
    toast('Configuration effacée');
  };
  $('#wipe').onclick = () => {
    store.del('glycia.data'); store.del('glycia.key'); store.del('glycia.proxy');
    store.del('glycia.onboarded'); store.del('glycia.profile');
    location.reload();
  };
}
$('#btnSet').addEventListener('click', () => { renderSettings(); openModal('set'); });

/* ==========================================================================
   18. ONBOARDING — 3 questions au premier lancement
   ========================================================================== */
/* Un repère plus serré pour les traitements sans couverture insulinique rapide */
function repereFor(p) {
  if (!p) return 180;
  if (p.treatment === 'alimentaire') return 130;
  if (p.treatment === 'oral') return 150;
  return 180;
}
$('#m-onboard').addEventListener('click', e => {
  const b = e.target.closest('[data-obq]');
  if (!b) return;
  $$(`#m-onboard [data-obq="${b.dataset.obq}"]`).forEach(x => x.classList.toggle('on', x === b));
});
function applyProfile(p, setGpNow) {
  state.profile = p;
  REPERE = repereFor(p);
  /* Au chargement, loadState() restaure déjà state.gp — inutile de rejouer setGp() et son message */
  if (setGpNow && p.gp && !state.gp) setGp(true);
  renderDay();
}
function finishOnboarding() {
  const type  = $('#m-onboard [data-obq="type"].on');
  const treat = $('#m-onboard [data-obq="treat"].on');
  const gp    = $('#m-onboard [data-obq="gp"].on');
  const profile = {
    type: type ? +type.dataset.obv : null,
    treatment: treat ? treat.dataset.obv : null,
    gp: gp ? gp.dataset.obv === '1' : false
  };
  store.set('glycia.onboarded', '1');
  store.set('glycia.profile', JSON.stringify(profile));
  applyProfile(profile, true);
}
function loadProfile() {
  const raw = store.get('glycia.profile');
  if (!raw) return;
  try { applyProfile(JSON.parse(raw)); } catch (_) {}
}

/* ==========================================================================
   19. PARTAGE PHOTO & RAPPELS DE REPAS
   ========================================================================== */

/* ---------- Web Share Target : partager une photo depuis la galerie ouvre l'analyse ---------- */
async function checkSharedPhoto() {
  if (new URLSearchParams(location.search).get('partage') !== '1') return;
  history.replaceState(null, '', location.pathname);
  try {
    const c = await caches.open('glycia-v1');
    const res = await c.match('./shared-photo');
    if (!res) return;
    const blob = await res.blob();
    await c.delete('./shared-photo');
    const dataURL = await new Promise((res2, rej) => {
      const fr = new FileReader();
      fr.onload = () => res2(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    state.analysis = null; mergeNext = false;
    openModal('shoot');
    runAnalysis(dataURL, null, false);
  } catch (_) {}
}

/* ---------- Rappels de repas : notification + favoris en actions rapides ---------- */
const MEAL_SLOTS = [
  { h: 8,  m: 0,  label: 'petit-déjeuner' },
  { h: 12, m: 30, label: 'déjeuner' },
  { h: 16, m: 30, label: 'goûter' },
  { h: 19, m: 30, label: 'dîner' }
];
let reminderTimer = null;

function nextMealSlot() {
  const now = new Date();
  for (const s of MEAL_SLOTS) {
    const t = new Date(now); t.setHours(s.h, s.m, 0, 0);
    if (t > now) return { time: t, slot: s };
  }
  const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(MEAL_SLOTS[0].h, MEAL_SLOTS[0].m, 0, 0);
  return { time: t, slot: MEAL_SLOTS[0] };
}
async function fireReminder(slot) {
  const opts = {
    body: `C'est l'heure du ${slot.label}. Ajoute un favori en un tap.`,
    icon: './icon.svg',
    tag: 'glycia-repas',
    actions: FAVORITES.slice(0, 2).map((f, i) => ({ action: String(i), title: `${f.icon} ${f.name}`.slice(0, 30) }))
  };
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
  if (reg) reg.showNotification('GlycIA', opts); else new Notification('GlycIA', opts);
}
function scheduleReminder() {
  clearTimeout(reminderTimer);
  if (store.get('glycia.reminders') !== '1' || !('Notification' in window) || Notification.permission !== 'granted') return;
  const { time, slot } = nextMealSlot();
  reminderTimer = setTimeout(() => { fireReminder(slot); scheduleReminder(); }, time - Date.now());
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleReminder(); });

async function setReminders(on) {
  if (on) {
    if (!('Notification' in window)) { toast('Notifications non disponibles sur ce navigateur'); return false; }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('Notifications bloquées par le navigateur'); return false; }
  }
  store.set('glycia.reminders', on ? '1' : '0');
  if (on) scheduleReminder(); else clearTimeout(reminderTimer);
  return true;
}

/* ---------- Ajout rapide depuis une action de notification ---------- */
function quickAddFavori(i) {
  const f = FAVORITES[i];
  if (!f) return;
  addMeal({ icon: f.icon, name: f.name, carbs: f.carbs, ig: f.ig, src: 'favori' });
  toast(`${f.name} ajouté depuis le rappel`);
}
function checkQuickAddParam() {
  const v = new URLSearchParams(location.search).get('addfav');
  if (v === null) return;
  history.replaceState(null, '', location.pathname);
  quickAddFavori(+v);
}
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'glycia-addfav' && e.data.index !== '') quickAddFavori(+e.data.index);
  });
}

/* ==========================================================================
   22. COMPTE-RENDU CONSULTATION — récap 4 semaines, imprimable
   ========================================================================== */
function buildReportData() {
  const today = {
    d: new Date(), carbs: totalCarbs(), ig: avgIg() || 0, meals: state.journal.length,
    byMoment: state.journal.reduce((acc, m) => { acc[momentOf(m.time.getHours())] += m.carbs; return acc; }, { matin: 0, midi: 0, gouter: 0, soir: 0 })
  };
  const days = PAST.slice(-27).concat([today]);
  const avgCarbs = Math.round(days.reduce((s, x) => s + x.carbs, 0) / days.length);
  const igDays = days.filter(x => x.carbs > 0);
  const igCarbs = igDays.reduce((s, x) => s + x.carbs, 0);
  const igAvg = igCarbs ? Math.round(igDays.reduce((s, x) => s + x.ig * x.carbs, 0) / igCarbs) : 0;
  const byMomentTotal = days.reduce((acc, x) => {
    const bm = x.byMoment || {};
    for (const k of ['matin', 'midi', 'gouter', 'soir']) acc[k] += bm[k] || 0;
    return acc;
  }, { matin: 0, midi: 0, gouter: 0, soir: 0 });
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 28);
  const gpEntries = state.gpLog.filter(l => l.t >= cutoff);
  return { days, avgCarbs, igAvg, byMomentTotal, from: days[0].d, to: days[days.length - 1].d, gpEntries };
}

function reportSummaryText(d) {
  const bm = d.byMomentTotal;
  return `${profileContext()}Période : ${d.days.length} jours, du ${d.from.toLocaleDateString('fr-FR')} au ${d.to.toLocaleDateString('fr-FR')}. `
    + `Moyenne ${d.avgCarbs} g de glucides par jour, IG moyen pondéré ${d.igAvg}. `
    + `Répartition cumulée par moment : matin ${bm.matin} g, midi ${bm.midi} g, goûter ${bm.gouter} g, soir ${bm.soir} g. `
    + (d.gpEntries.length
        ? `Tolérance digestive : ${d.gpEntries.length} épisodes notés sur la période, dont ${d.gpEntries.filter(l => l.f[2] === 'no').length} mal tolérés. `
        : 'Pas de journal de tolérance digestive sur la période. ')
    + `Repère indicatif quotidien : ${REPERE} g.`;
}

const REPORT_RULES = () => `Tu prépares 5 questions pour la consultation de suivi diabète d'un patient qui utilise GlycIA, une application de journal alimentaire.

Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour et sans balises Markdown.
Format exact attendu : {"questions":["...","...","...","...","..."]}
Règles :
- Exactement 5 questions, une phrase chacune, au tutoiement, à poser au médecin ou à se poser soi-même avant le rendez-vous.
- Base-toi sur les chiffres fournis : tendance des glucides, répartition par moment, IG moyen, tolérance digestive si présente.
- Chaque question référence un chiffre ou un motif précis des données fournies, jamais de généralité creuse.
- Jamais de dose d'insuline, jamais de diagnostic, jamais de jugement sur les choix alimentaires.`;

async function askConsultQuestions(summaryText) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(aiURL(), {
      method: 'POST',
      headers: aiHeaders(),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: VISION.model,
        max_tokens: 500,
        system: [{ type: 'text', text: REPORT_RULES(), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: [{ type: 'text', text: summaryText }] }]
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = pickJSON(await r.json());
    const qs = (j.questions || []).filter(q => q).map(q => String(q).slice(0, 220)).slice(0, 5);
    return qs.length ? qs : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(to);
  }
}

const FALLBACK_QUESTIONS = [
  "Ma répartition de glucides par moment de la journée te semble-t-elle adaptée ?",
  "Comment lire mon IG moyen pondéré sur ces 4 semaines : faut-il viser plus bas ?",
  "Faut-il ajuster mon repère quotidien au vu du bilan de la période ?",
  "Les épisodes de tolérance digestive notés changent-ils quelque chose au suivi ?",
  "Y a-t-il un motif dans mes journées les plus chargées en glucides ?"
];

function reportSkeleton(d, questions) {
  const bm = d.byMomentTotal;
  const bmTotal = bm.matin + bm.midi + bm.gouter + bm.soir || 1;
  const bmRow = (label, v) => `
    <div class="rep-bm"><span>${label}</span><div class="rep-bm-bar"><i style="width:${Math.round(v / bmTotal * 100)}%"></i></div><b>${v} g</b></div>`;
  const rows = d.days.slice().reverse().map(x => `
    <tr><td>${x.d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' })}</td><td>${x.carbs} g</td><td>${x.ig || '—'}</td><td>${x.meals}</td></tr>`).join('');
  const gpRows = d.gpEntries.length
    ? d.gpEntries.map(l => `
      <tr><td>${l.t.toLocaleDateString('fr-FR', { day:'numeric', month:'short' })}</td><td>${l.f[0]} ${esc(l.f[1])}</td><td>${esc(l.meal)}</td></tr>`).join('')
    : `<tr><td colspan="3" style="color:var(--ink-faint)">Rien de noté sur la période.</td></tr>`;
  const qList = questions
    ? `<ol class="rep-q">${questions.map(q => `<li>${esc(q)}</li>`).join('')}</ol>`
    : `<p class="foot-note">Questions en préparation…</p>`;

  return `
    <div class="rep-head">
      <h3>Compte-rendu GlycIA</h3>
      <p>${d.from.toLocaleDateString('fr-FR', { day:'numeric', month:'long' })} — ${d.to.toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' })} · ${d.days.length} jours</p>
      ${profileContext() ? `<p class="rep-profile">${esc(profileContext())}</p>` : ''}
    </div>

    <div class="rep-stats">
      <div class="rep-stat"><b>${d.avgCarbs}</b><span>g / jour en moyenne</span></div>
      <div class="rep-stat"><b>${d.igAvg}</b><span>IG moyen pondéré</span></div>
      <div class="rep-stat"><b>${d.gpEntries.length}</b><span>épisodes de tolérance notés</span></div>
    </div>

    <h4>Répartition par moment</h4>
    ${bmRow('Matin', bm.matin)}${bmRow('Midi', bm.midi)}${bmRow('Goûter', bm.gouter)}${bmRow('Soir', bm.soir)}

    <h4 style="margin-top:18px">Glucides par jour</h4>
    <table class="rep-table"><thead><tr><th>Jour</th><th>Glucides</th><th>IG</th><th>Repas</th></tr></thead>
      <tbody>${rows}</tbody></table>

    <h4 style="margin-top:18px">Journal de tolérance digestive</h4>
    <table class="rep-table"><thead><tr><th>Date</th><th>Ressenti</th><th>Repas</th></tr></thead>
      <tbody>${gpRows}</tbody></table>

    <h4 style="margin-top:18px">5 questions pour la consultation</h4>
    ${qList}

    <div class="sheet-foot no-print">
      <button class="btn btn-ghost" data-close>Fermer</button>
      <button class="btn btn-primary btn-block" id="btnPrintReport"><svg><use href="#i-check"/></svg> Imprimer / Enregistrer en PDF</button>
    </div>
    <p class="foot-note no-print" style="margin-top:10px">Rien n'est envoyé nulle part pour générer ce document, hors les 5 questions au médecin (si Claude est configuré).</p>`;
}

function bindReportPrint() {
  const b = $('#btnPrintReport');
  if (b) b.onclick = () => window.print();
}

async function buildAndRenderReport() {
  const d = buildReportData();
  $('#reportBody').innerHTML = reportSkeleton(d, null);
  bindReportPrint();
  const qs = hasAI() ? await askConsultQuestions(reportSummaryText(d)) : null;
  $('#reportBody').innerHTML = reportSkeleton(d, qs || FALLBACK_QUESTIONS);
  bindReportPrint();
}
$('#btnReport').addEventListener('click', () => { openModal('report'); buildAndRenderReport(); });

/* ==========================================================================
   23. RÉTROSPECTIVE HEBDOMADAIRE — le dimanche, un regard, pas un bilan
   ========================================================================== */
function retroWeekKey(d = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay()); // recule jusqu'au dimanche de la semaine en cours
  return dayKey(x);
}
function retroSummaryText() {
  const today = { d: new Date(), carbs: totalCarbs(), ig: avgIg() || 0, meals: state.journal.length };
  const days = PAST.slice(-6).concat([today]);
  const avg = Math.round(days.reduce((s, x) => s + x.carbs, 0) / days.length);
  const detail = days.map(x => `${x.d.toLocaleDateString('fr-FR', { weekday:'long' })} : ${x.carbs} g${x.ig ? `, IG ${x.ig}` : ''}${x.meals ? `, ${x.meals} repas` : ''}`).join(' ; ');
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 7);
  const gpCount = state.gpLog.filter(l => l.t >= cutoff).length;
  return `${profileContext()}Semaine écoulée, moyenne ${avg} g de glucides par jour. Détail jour par jour : ${detail}.`
    + (gpCount ? ` ${gpCount} épisode(s) de tolérance digestive notés cette semaine.` : '');
}

const RETRO_RULES = () => `Tu écris la rétrospective hebdomadaire d'un utilisateur de GlycIA, une application de suivi des repas pour personnes diabétiques.

Réponds UNIQUEMENT par un objet JSON valide, sans aucun texte autour et sans balises Markdown.
Format exact attendu : {"lines":["...","...","...","...","..."]}
Règles :
- Exactement 5 lignes courtes, au tutoiement, chaleureuses.
- Ligne 1 : ce qui a bien marché cette semaine, un fait précis tiré des données.
- Ligne 2 : un motif récurrent observé (horaire, jour, type de repas...), sans jugement.
- Ligne 3 : une suggestion douce et concrète pour la semaine prochaine.
- Lignes 4 et 5 : un mot d'encouragement ou d'observation.
- C'est un regard, jamais un bilan chiffré : zéro score, zéro comparaison à une norme, zéro culpabilisation.
- Jamais de dose d'insuline, jamais de consigne médicale.`;

async function askRetro(summaryText) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const r = await fetch(aiURL(), {
      method: 'POST',
      headers: aiHeaders(),
      signal: ctrl.signal,
      body: JSON.stringify({
        model: VISION.model,
        max_tokens: 500,
        system: [{ type: 'text', text: RETRO_RULES(), cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: [{ type: 'text', text: summaryText }] }]
      })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = pickJSON(await r.json());
    const lines = (j.lines || []).filter(l => l).map(l => String(l).slice(0, 200)).slice(0, 5);
    return lines.length ? lines : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(to);
  }
}

const FALLBACK_RETRO = [
  "Tu as noté tes repas toute la semaine — c'est déjà l'essentiel.",
  "Regarde si un jour ou un moment revient plus chargé que les autres, sans le juger.",
  "Une petite suggestion : varie les sources de fibres au repas du soir.",
  "Chaque semaine notée t'apprend un peu plus sur ce qui te convient.",
  "Prends ce regard comme un point de départ, pas un bilan."
];

function retroPlaceholder() {
  $('#retroBody').innerHTML = `
    <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.5">
      Le dimanche, GlycIA relit ta semaine et t'écrit un petit regard dessus — pas un bilan chiffré.
    </p>
    <button class="btn btn-ghost btn-block" id="retroNow" style="margin-top:12px">Voir quand même</button>`;
  $('#retroNow').onclick = () => generateRetro(true);
}
function retroLines(lines) {
  $('#retroBody').innerHTML = `
    <div class="glycia-note" style="align-items:flex-start">
      <div class="ava sm" aria-hidden="true" style="width:34px;height:34px">${mascotSVG('care')}</div>
      <div>${lines.map(l => `<p style="margin-bottom:6px">${esc(l)}</p>`).join('')}</div>
    </div>
    <button class="btn btn-ghost btn-block" id="retroRefresh" style="margin-top:10px">Actualiser</button>`;
  $('#retroRefresh').onclick = () => generateRetro(true);
}
async function generateRetro(force) {
  const key = retroWeekKey();
  if (!force) {
    const cached = store.get('glycia.retro');
    if (cached) {
      try {
        const o = JSON.parse(cached);
        if (o.week === key && o.lines && o.lines.length) { retroLines(o.lines); return; }
      } catch (_) {}
    }
    if (new Date().getDay() !== 0) { retroPlaceholder(); return; }
  }
  $('#retroBody').innerHTML = `<p class="foot-note" style="margin:0">Ta rétrospective arrive…</p>`;
  const lines = hasAI() ? await askRetro(retroSummaryText()) : null;
  const final = lines || FALLBACK_RETRO;
  store.set('glycia.retro', JSON.stringify({ week: key, lines: final }));
  retroLines(final);
}

/* ==========================================================================
   24. MODE HOSPITALISATION — export rapide pour l'équipe soignante
   ========================================================================== */
function buildHospitalExport() {
  const last = [...state.journal].sort((a, x) => x.time - a.time)[0];
  const today = { d: new Date(), carbs: totalCarbs(), ig: avgIg() || 0, meals: state.journal.length };
  const recentDays = PAST.slice(-2).concat([today]);
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 3);
  const gpRecent = state.gpLog.filter(l => l.t >= cutoff);
  return { last, recentDays, gpRecent, generatedAt: new Date() };
}

function hospitalExportText(d) {
  const lines = ['GlycIA — résumé pour l\'équipe soignante', `Généré le ${d.generatedAt.toLocaleString('fr-FR')}`, ''];
  const p = state.profile;
  if (p && (p.type || p.treatment || p.gp)) {
    lines.push(`Profil : ${[p.type ? `diabète type ${p.type}` : null, p.treatment ? TREAT_LABEL[p.treatment] : null, p.gp ? 'gastroparésie' : null].filter(Boolean).join(', ')}`);
  }
  lines.push(`Repère indicatif quotidien : ${REPERE} g de glucides`, '');
  lines.push(d.last
    ? `Dernier repas noté : ${hhmm(d.last.time)} — ${d.last.name} (${d.last.carbs} g, IG ${d.last.ig})`
    : 'Aucun repas noté aujourd\'hui.');
  lines.push('', 'Derniers jours :');
  d.recentDays.slice().reverse().forEach(x => {
    lines.push(`- ${x.d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'short' })} : ${x.carbs} g de glucides, IG moyen ${x.ig || '—'}, ${x.meals} repas`);
  });
  if (d.gpRecent.length) {
    lines.push('', 'Tolérance digestive récente :');
    d.gpRecent.forEach(l => lines.push(`- ${l.t.toLocaleString('fr-FR', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })} : ${l.f[1]} (${l.meal})`));
  }
  lines.push('', 'Ce document est une estimation issue d\'un journal alimentaire personnel, pas un dispositif médical. Aucune dose d\'insuline n\'y figure.');
  return lines.join('\n');
}

function renderHospitalExport() {
  const d = buildHospitalExport();
  const text = hospitalExportText(d);
  $('#hospBody').innerHTML = `
    <pre class="hosp-text">${esc(text)}</pre>
    <div class="sheet-foot no-print">
      <button class="btn btn-ghost" data-close>Fermer</button>
      <button class="btn btn-outline" id="hospCopy">Copier</button>
      <button class="btn btn-primary btn-block" id="hospShare"><svg><use href="#i-check"/></svg> Partager</button>
    </div>
    <p class="foot-note no-print" style="margin-top:10px">Rien n'est envoyé nulle part : ce texte reste sur ton appareil tant que tu ne le partages pas toi-même.</p>`;

  $('#hospCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(text); toast('Copié dans le presse-papiers'); }
    catch (_) { toast('Copie impossible ici — sélectionne le texte manuellement'); }
  };
  $('#hospShare').onclick = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'GlycIA — résumé pour l\'équipe soignante', text }); }
      catch (_) {}
    } else {
      window.print();
    }
  };
}
$('#btnHosp').addEventListener('click', () => { openModal('hosp'); renderHospitalExport(); });

/* ==========================================================================
   13. INIT
   ========================================================================== */
$('#goGastro').addEventListener('click', () => go('gastro'));
$('#goGastro2').addEventListener('click', () => go('gastro'));
$('#goRamadan').addEventListener('click', () => go('ramadan'));
$('#goRamadan2').addEventListener('click', () => go('ramadan'));
$('#btnScan2').addEventListener('click', openScan);
$('#todayLabel').textContent = new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
seedPast();
if (!loadState()) seed();
loadProfile();
renderFavorites();
setMascot('hello');
renderDay();
findRecipe();
renderGpLog();
const sharedIncoming = new URLSearchParams(location.search).get('partage') === '1';
if (!store.get('glycia.onboarded') && !sharedIncoming) openModal('onboard');
checkQuickAddParam();
checkSharedPhoto();
scheduleReminder();
generateRetro(false);

})();
