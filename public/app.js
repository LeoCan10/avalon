// Interfaz de Avalon: estado del servidor por polling + pantallas y animaciones.
const $app = document.getElementById('app');
const $fab = document.getElementById('fab');
const $ov = document.getElementById('ov');

const ROLE_INFO = {
  merlin: 'Conocés a los malvados (menos a Mordred). Guiá a los leales sin que el Asesino te descubra.',
  percival: 'Sabés quién es Merlín… pero Morgana puede hacerse pasar por él.',
  servant: 'No sabés nada. Descubrí a los traidores con la conversación y los votos.',
  assassin: 'Si el bien gana tres misiones, tenés una última chance: adivinar quién es Merlín.',
  morgana: 'Ante los ojos de Percival, vos también parecés Merlín.',
  mordred: 'Ni Merlín sabe que sos malvado.',
  oberon: 'Sos malvado, pero no conocés a tus compañeros y ellos no te conocen a vos.',
  minion: 'Conocés a tus compañeros malvados. Saboteá las misiones sin que te descubran.',
};
const ROLE_QUOTE = {
  merlin: 'Ves la sombra en el corazón de los hombres. Hablá en susurros.',
  percival: 'Tu deber es proteger al mago… si sabés reconocerlo.',
  servant: 'Tu espada es leal y tu juicio, tu única arma.',
  assassin: 'Esperá en las sombras. Un solo golpe decidirá el destino de Camelot.',
  morgana: 'La magia que confunde es la más poderosa de todas.',
  mordred: 'Tu traición es invisible incluso para el gran mago.',
  oberon: 'Servís a la oscuridad, pero caminás solo.',
  minion: 'Juraste lealtad a Mordred. Sembrá la duda.',
};
const ROLE_PARTICLES = { merlin: 'stars', percival: 'light', servant: 'motes', assassin: 'embers', morgana: 'mist', mordred: 'embers', oberon: 'fog', minion: 'embers' };
const ROLE_NAMES = { merlin: 'Merlín', percival: 'Percival', servant: 'Leal servidor', assassin: 'Asesino', morgana: 'Morgana', mordred: 'Mordred', oberon: 'Oberón', minion: 'Esbirro' };
const EVIL = ['assassin', 'morgana', 'mordred', 'oberon', 'minion'];
const EVIL_COUNT = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };

let S = null;
let selected = new Set();
let lastPhaseKey = '';
let seen = null; // eventos ya mostrados como animación

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Jugadores ficticios para la galería de demostración
const DEMO = { players: ['Arturo', 'Ginebra', 'Lancelot', 'Gawain', 'Tristán', 'Isolda', 'Galahad'].map((name, i) => ({ id: 'p' + i, name })) };
let showGallery = false;
const nameOf = (id) => esc((S || DEMO).players.find((p) => p.id === id)?.name ?? '¿?');
const list = (ids) => ids.map(nameOf).join(', ');
const rule = '<div class="rule"><i></i></div>';
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function toast(msg, info) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div');
  t.className = 'toast' + (info ? ' info' : ''); t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ================= Servidor =================
const POLL_MS = 1500;
let busy = false;

function applyState(s) {
  if (S && s.ver < S.ver) return;
  const prev = S;
  const key = s.game ? s.game.phase + s.game.questIdx + s.game.leader + s.game.rejections : 'lobby';
  if (key !== lastPhaseKey) { selected = new Set(); lastPhaseKey = key; }
  S = s;
  detectEvents(prev, s);
  render();
}

function forgetRoom(msg) {
  store.del('avalon.code'); store.del('avalon.token'); S = null; seen = null;
  history.replaceState(null, '', '/');
  closeAllOverlays();
  if (msg) toast(msg);
  render();
}

const ARG = { setOptions: 'options', kick: 'target', vote: 'approve', questCard: 'success', propose: 'team', assassinate: 'target' };
const ACTION_SOUND = { vote: 'seal', questCard: 'flip', propose: 'quill', assassinate: 'cardBad' };
async function send(action, arg) {
  if (busy) return;
  busy = true;
  SFX[ACTION_SOUND[action] || 'click']();
  const payload = ARG[action] ? { [ARG[action]]: arg } : { ...(arg || {}) };
  try {
    const r = await fetch('/api/room', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, code: S?.code ?? payload.code, token: store.get('avalon.token'), ...payload }),
    });
    const data = await r.json();
    if (!r.ok) return toast(data.error || 'Error');
    if (data.token) {
      store.set('avalon.code', data.state.code); store.set('avalon.token', data.token);
      history.replaceState(null, '', '?sala=' + data.state.code);
    }
    if (data.state) applyState(data.state);
  } catch { toast('Sin conexión, probá de nuevo'); }
  finally { busy = false; }
}

async function poll() {
  const code = store.get('avalon.code'), token = store.get('avalon.token');
  if (!code || !token || document.hidden) return;
  try {
    const r = await fetch(`/api/room?code=${encodeURIComponent(code)}&token=${encodeURIComponent(token)}&ver=${S ? S.ver : ''}`);
    const data = await r.json();
    if (r.status === 410) return forgetRoom(S ? 'Te sacaron de la sala' : null);
    if (!r.ok) { if (data.error === 'No existe esa sala') forgetRoom(S ? 'La sala expiró' : null); return; }
    if (!data.same) applyState(data);
  } catch {}
}
setInterval(poll, POLL_MS);
document.addEventListener('visibilitychange', poll);

// ================= Eventos animados =================
function snapshot(s) {
  const g = s.game;
  if (!g) return { vote: '', results: 0, end: false, game: '' };
  const lv = g.lastVote;
  return {
    game: g.order.join(','),
    vote: lv ? `${lv.quest}|${lv.leader}|${JSON.stringify(lv.votes)}` : '',
    results: g.results.length,
    end: g.phase === 'end',
  };
}

function detectEvents(prev, s) {
  const now = snapshot(s);
  if (!s.game) { seen = now; return; }
  const introKey = `avalon.intro.${s.code}.${now.game}`;
  // Primera vez que veo esta partida (o es nueva): todo lo anterior cuenta como visto
  if (!seen || seen.game !== now.game) {
    const fresh = !!seen && !prev?.game; // venía del lobby
    seen = fresh ? { ...now, vote: '', results: 0, end: false } : now;
    if (!store.get(introKey)) { store.set(introKey, '1'); queueOverlay((el, close) => roleOverlay(el, close, true)); }
    if (!fresh) return;
  }
  const g = s.game;
  // Aviso con corno cuando me toca elegir el equipo
  const myTurn = g.phase === 'team' && g.leader === s.meId;
  const wasMyTurn = prev?.game?.phase === 'team' && prev.game.leader === s.meId && prev.game.questIdx === g.questIdx;
  if (myTurn && !wasMyTurn) setTimeout(() => SFX.yourTurn(), ovActive || ovQueue.length ? 1500 : 0);
  if (now.vote && now.vote !== seen.vote) queueOverlay((el, close) => voteOverlay(el, close, g.lastVote, g.order));
  if (now.results > seen.results) {
    for (let i = seen.results; i < now.results; i++) queueOverlay((el, close) => questOverlay(el, close, g.results[i], i));
  }
  if (now.end && !seen.end) queueOverlay((el, close) => endOverlay(el, close, g));
  seen = now;
}

// ================= Superposiciones =================
const ovQueue = [];
let ovActive = false;
function queueOverlay(build) { ovQueue.push(build); if (!ovActive) nextOverlay(); }
function nextOverlay() {
  const build = ovQueue.shift();
  if (!build) { ovActive = false; $ov.innerHTML = ''; return; }
  ovActive = true;
  $ov.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'overlay';
  $ov.appendChild(el);
  let closed = false;
  build(el, () => {
    if (closed) return; closed = true;
    el.classList.add('out');
    setTimeout(() => { el.remove(); nextOverlay(); }, 280);
  });
}
function closeAllOverlays() { ovQueue.length = 0; ovActive = false; $ov.innerHTML = ''; }

function particles(type, n = 26) {
  const conf = {
    stars:  { colors: ['#ffffff', '#c9d6ff', '#e7c36a'], size: [2, 4], dur: [9, 16] },
    light:  { colors: ['#bcd8ff', '#ffffff'], size: [3, 7], dur: [8, 14] },
    motes:  { colors: ['#e7c36a', '#fff1c2'], size: [2, 5], dur: [8, 14] },
    embers: { colors: ['#ff6a3a', '#ffb03a', '#ff3b2b'], size: [2, 5], dur: [5, 10] },
    mist:   { colors: ['#d58cff66', '#9a5cff55', '#ffffff'], size: [3, 40], dur: [10, 18] },
    fog:    { colors: ['#7dffcf44', '#3d7a6c66'], size: [20, 60], dur: [12, 20] },
    gold:   { colors: ['#e7c36a', '#fff1c2', '#ffffff'], size: [3, 7], dur: [5, 9] },
  }[type] || { colors: ['#fff'], size: [2, 4], dur: [8, 12] };
  const r = (a, b) => a + Math.random() * (b - a);
  let html = '';
  for (let i = 0; i < n; i++) {
    const size = r(...conf.size);
    const c = conf.colors[i % conf.colors.length];
    const blur = size > 12 ? `filter:blur(${size / 3}px);` : `box-shadow:0 0 ${size * 2}px ${c};`;
    html += `<span style="left:${r(0, 100)}%;width:${size}px;height:${size}px;background:${c};${blur}animation-duration:${r(...conf.dur)}s;animation-delay:-${r(0, 12)}s;--dx:${r(-60, 60)}px"></span>`;
  }
  return `<div class="particles">${html}</div>`;
}

function flipCard(backSvg, frontSvg, cls = 'flip') {
  return `<div class="${cls}"><div class="inner"><div class="face back">${backSvg}</div><div class="face front">${frontSvg}</div></div></div>`;
}

// Pantalla secreta del personaje: el tema visual aparece SÓLO con la carta dada vuelta.
function roleOverlay(el, close, intro, demoMe) {
  const me = demoMe || S?.game?.me;
  if (!me) return close();
  if (intro) SFX.bell(3);
  const night = me.night
    ? `<div class="night"><div class="small">${esc(me.night.label)}</div><div class="names">${me.night.ids.length ? list(me.night.ids) : '—'}</div></div>`
    : '';
  el.innerHTML = `
    <div class="ov-title">${intro ? 'Cae la noche sobre Camelot' : 'Tu destino'}</div>
    <div class="ov-sub">${intro ? 'Cada uno recibe su carta. Que nadie más vea tu pantalla.' : 'Mirá con cuidado: nadie más debe ver tu pantalla.'}</div>
    ${flipCard(ART.card('back'), ART.card(me.role))}
    <div class="role-info">
      <div class="side ${me.team}">${me.team === 'good' ? 'Leal a Arturo' : 'Secuaz de Mordred'}</div>
      <div class="quote">“${ROLE_QUOTE[me.role]}”</div>
      <div class="small">${ROLE_INFO[me.role]}</div>
      ${night}
    </div>
    <div class="tap">Tocá la carta para revelarla</div>
    <button class="btn dark" data-close>Ocultar y volver</button>
    <div class="fx"></div>`;
  const flip = el.querySelector('.flip');
  const fx = el.querySelector('.fx');
  const tap = el.querySelector('.tap');
  flip.onclick = () => {
    const open = flip.classList.toggle('open');
    el.className = 'overlay' + (open ? ' opened role-' + me.role : '');
    fx.innerHTML = open ? particles(ROLE_PARTICLES[me.role], me.role === 'oberon' || me.role === 'morgana' ? 18 : 30) : '';
    tap.textContent = open ? 'Tocá la carta para ocultarla' : 'Tocá la carta para revelarla';
    SFX.flip();
    if (open) setTimeout(() => SFX.reveal(me.team), 250);
    if (open && navigator.vibrate) navigator.vibrate(me.team === 'evil' ? [30, 40, 30] : 20);
  };
  el.querySelector('[data-close]').onclick = close;
}

function voteOverlay(el, close, lv, order) {
  const yes = Object.values(lv.votes).filter(Boolean).length;
  el.innerHTML = `
    <div class="ov-title">Votación</div>
    <div class="ov-sub">${nameOf(lv.leader)} propuso a <b>${list(lv.team)}</b></div>
    <div class="vote-list">${order.map((id) => `
      <div class="vote-item ${id === lv.leader ? 'leader' : ''}">
        <div class="seal-wrap"><div class="blank"></div>${ART.seal(lv.votes[id])}</div>
        <div class="vn">${nameOf(id)}</div></div>`).join('')}</div>
    <div class="verdict ${lv.approved ? 'good' : 'evil'}">${lv.approved ? 'Aprobado' : 'Rechazado'}</div>
    <div class="small night-muted">${yes} a favor · ${order.length - yes} en contra</div>
    <button class="btn dark" data-close style="opacity:0">Continuar</button>`;
  const items = [...el.querySelectorAll('.vote-item')];
  items.forEach((it, i) => setTimeout(() => { it.classList.add('show'); SFX.seal(); }, 500 + i * 160));
  const t = 700 + items.length * 160;
  setTimeout(() => { el.querySelector('.verdict').classList.add('show'); lv.approved ? SFX.approve() : SFX.reject(); }, t);
  setTimeout(() => { const b = el.querySelector('[data-close]'); b.style.opacity = 1; b.style.transition = 'opacity .4s'; }, t + 400);
  el.querySelector('[data-close]').onclick = close;
}

function questOverlay(el, close, result, idx) {
  const cards = shuffle([...Array(result.team.length - result.fails).fill(true), ...Array(result.fails).fill(false)]);
  el.innerHTML = `
    <div class="ov-title">Misión ${idx + 1}</div>
    <div class="ov-sub">Partieron ${list(result.team)}. Se barajan las cartas…</div>
    <div class="reveal-row">${cards.map((c) => flipCard(ART.card('back'), ART.questCard(c), 'mini-flip')).join('')}</div>
    <div class="verdict ${result.success ? 'good' : 'evil'}">${result.success ? 'Éxito' : 'Fracaso'}</div>
    <div class="small night-muted" style="opacity:0" data-sum>${result.fails} carta${result.fails === 1 ? '' : 's'} de fracaso</div>
    <button class="btn dark" data-close style="opacity:0">Continuar</button>
    <div class="fx"></div>`;
  const flips = [...el.querySelectorAll('.mini-flip')];
  flips.forEach((f, i) => setTimeout(() => {
    f.classList.add('open');
    SFX.flip();
    if (!cards[i]) { setTimeout(() => SFX.cardBad(), 250); if (navigator.vibrate) navigator.vibrate(60); }
  }, 1100 + i * 750));
  const t = 1300 + flips.length * 750;
  setTimeout(() => {
    el.querySelector('.verdict').classList.add('show');
    Music.duck(3);
    result.success ? SFX.success() : SFX.fail();
    el.querySelector('.fx').innerHTML = particles(result.success ? 'gold' : 'embers', 30);
    for (const sel of ['[data-sum]', '[data-close]']) { const x = el.querySelector(sel); x.style.transition = 'opacity .4s'; x.style.opacity = 1; }
  }, t);
  el.querySelector('[data-close]').onclick = close;
}

function endOverlay(el, close, g) {
  const good = g.winner === 'good';
  const isEvil = (id) => EVIL.includes(g.roles[id]);
  const title = good ? 'La luz prevalece' : 'La oscuridad reina';
  const kicker = good ? 'Gana el Bien' : 'Gana el Mal';
  const reason = `${esc(g.winReason)}${g.assassinTarget ? `. El Asesino señaló a ${nameOf(g.assassinTarget)}.` : '.'}`;
  const crows = good ? '' : Array.from({ length: 6 }, (_, i) =>
    `<span class="crow" style="top:${8 + Math.random() * 45}%;animation-delay:${0.9 + i * 0.55 + Math.random() * 0.4}s;animation-duration:${4.5 + Math.random() * 2.5}s;--s:${0.6 + Math.random() * 0.7}">${ART.crow}</span>`).join('');
  el.classList.add(good ? 'end-good' : 'end-evil');
  el.innerHTML = `
    <div class="end-scene">${good ? '<div class="rays"></div><div class="burst"></div>' : '<div class="flash"></div><div class="beat"></div><div class="fog"></div>'}${crows}</div>
    <div class="end-emblem">${good ? ART.excalibur : ART.darkCrown}</div>
    <div class="end-kicker">${kicker}</div>
    <div class="end-title">${title}</div>
    <div class="ov-sub end-sub">${reason}</div>
    <div class="end-grid">${g.order.map((id, i) => {
      const win = good !== isEvil(id);
      return `<div class="pc ${win ? 'win' : 'lose'} ${id === g.assassinTarget ? 'target' : ''}" style="animation-delay:${2 + i * 0.12}s">${ART.card(g.roles[id])}<div class="pn">${nameOf(id)}</div></div>`;
    }).join('')}</div>
    <button class="btn end-btn" data-close>Ver el tablero</button>
    <div class="fx">${particles(good ? 'gold' : 'embers', good ? 46 : 36)}</div>`;
  if (navigator.vibrate) navigator.vibrate(good ? [30, 50, 30, 50, 200] : [0, 600, 120, 120, 60, 500, 120, 120, 60]);
  if (!good) setTimeout(() => el.classList.add('shake'), 600);
  Music.duck(good ? 6 : 8);
  SFX.victory(good);
  el.querySelector('[data-close]').onclick = close;
}

// ================= Pantallas =================
function render() {
  $fab.innerHTML = '';
  renderAudioControls();
  document.body.dataset.screen = !S ? (showGallery ? 'gallery' : 'home') : !S.game ? 'lobby' : 'game';
  if (!S && showGallery) return renderGallery();
  if (!S) return renderHome();
  if (!S.game) return renderLobby();
  renderGame();
}
const setFab = (html) => ($fab.innerHTML = `<div class="fab">${html}</div>`);

// ---- Botones de música y sonido (fijos arriba a la derecha) ----
const ICON_MUSIC = `<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="6.5" cy="18" r="2.8" fill="currentColor"/><circle cx="17.5" cy="16" r="2.8" fill="currentColor"/></svg>`;
const ICON_SFX = `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
function renderAudioControls() {
  let box = document.getElementById('audio');
  if (!box) {
    box = document.createElement('div'); box.id = 'audio'; box.className = 'audio-ctl';
    document.body.appendChild(box);
    box.onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.a === 'music') Sound.setMusic(!Sound.music); else Sound.setSfx(!Sound.sfx);
      renderAudioControls();
      toast(b.dataset.a === 'music'
        ? (Sound.music ? 'Música activada (mejor en un solo celular)' : 'Música apagada')
        : (Sound.sfx ? 'Sonidos activados' : 'Sonidos apagados'), true);
    };
  }
  box.innerHTML = `
    <button data-a="music" class="${Sound.music ? 'on' : ''}" title="Música" aria-label="Música" aria-pressed="${Sound.music}">${ICON_MUSIC}</button>
    <button data-a="sfx" class="${Sound.sfx ? 'on' : ''}" title="Sonidos" aria-label="Sonidos" aria-pressed="${Sound.sfx}">${ICON_SFX}</button>`;
}

// ---- Galería de personajes con demostraciones ----
const DEMO_NIGHT = {
  merlin: { label: 'Estos jugadores son malvados', ids: ['p2', 'p5'] },
  percival: { label: 'Uno es Merlín y el otro Morgana', ids: ['p1', 'p4'] },
  assassin: { label: 'Tus compañeros malvados', ids: ['p4', 'p6'] },
  morgana: { label: 'Tus compañeros malvados', ids: ['p3', 'p6'] },
  mordred: { label: 'Tus compañeros malvados', ids: ['p3', 'p4'] },
  minion: { label: 'Tus compañeros malvados', ids: ['p3', 'p4'] },
};
const demoMe = (role) => ({ role, roleName: ROLE_NAMES[role], team: EVIL.includes(role) ? 'evil' : 'good', night: DEMO_NIGHT[role] || null });
const DEMO_ORDER = DEMO.players.map((p) => p.id);
const DEMO_ROLES = { p0: 'servant', p1: 'merlin', p2: 'percival', p3: 'assassin', p4: 'morgana', p5: 'servant', p6: 'mordred' };
const DEMOS = {
  vote: () => queueOverlay((el, c) => voteOverlay(el, c, { leader: 'p0', team: ['p0', 'p2', 'p4'], approved: true, votes: { p0: true, p1: true, p2: true, p3: false, p4: true, p5: false, p6: true } }, DEMO_ORDER)),
  questOk: () => queueOverlay((el, c) => questOverlay(el, c, { success: true, fails: 0, team: ['p0', 'p1', 'p5'] }, 0)),
  questKo: () => queueOverlay((el, c) => questOverlay(el, c, { success: false, fails: 1, team: ['p1', 'p2', 'p3', 'p5'] }, 1)),
  winGood: () => queueOverlay((el, c) => endOverlay(el, c, { winner: 'good', winReason: 'Tres misiones exitosas y Merlín sobrevivió', assassinTarget: 'p2', order: DEMO_ORDER, roles: DEMO_ROLES })),
  winEvil: () => queueOverlay((el, c) => endOverlay(el, c, { winner: 'evil', winReason: 'El Asesino encontró a Merlín', assassinTarget: 'p1', order: DEMO_ORDER, roles: DEMO_ROLES })),
};

function renderGallery() {
  const GOOD = ['merlin', 'percival', 'servant'];
  const BAD = ['assassin', 'morgana', 'mordred', 'oberon', 'minion'];
  const cards = (roles) => `<div class="gal-grid">${roles.map((r) => `
    <button class="gal-card" data-role="${r}">${ART.card(r)}<span class="small it">${ROLE_INFO[r].split('.')[0]}.</span></button>`).join('')}</div>`;
  $app.innerHTML = `
    <div class="topbar"><button class="btn dark small" id="back">← Volver</button><span class="night-muted small it">galería</span></div>
    <div class="center" style="margin:14px 0 4px"><div class="deco" style="font-size:28px;color:var(--gold)">Los personajes</div>
      <div class="tagline">Tocá una carta para ver la pantalla secreta de ese personaje</div></div>
    <div class="scroll"><h2 style="color:var(--blue)">Leales a Arturo</h2>${rule}${cards(GOOD)}</div>
    <div class="scroll"><h2 style="color:var(--red)">Secuaces de Mordred</h2>${rule}${cards(BAD)}</div>
    <div class="scroll">
      <h2>Así se ve una partida</h2>
      <div class="small muted it">Ejemplos con jugadores inventados: Arturo, Ginebra, Lancelot…</div>
      ${rule}
      <div class="demo-btns">
        <button class="btn dark" data-demo="vote">Una votación</button>
        <button class="btn dark" data-demo="questOk">Una misión exitosa</button>
        <button class="btn dark" data-demo="questKo">Una misión saboteada</button>
        <button class="btn dark" data-demo="winGood">Final: gana el bien</button>
        <button class="btn dark" data-demo="winEvil">Final: gana el mal</button>
      </div>
    </div>
    <div class="scroll">
      <h2>Cartas de misión y votos</h2>
      <div class="small muted it">Los leales sólo pueden jugar Éxito. Los votos se sellan con cera.</div>
      ${rule}
      <div class="gal-extra"><span class="qcard">${ART.questCard(true)}</span><span class="qcard">${ART.questCard(false)}</span>
        <span class="seals">${ART.seal(true)}${ART.seal(false)}</span></div>
    </div>`;
  document.getElementById('back').onclick = () => { SFX.click(); showGallery = false; render(); $app.scrollTop = 0; };
  document.querySelectorAll('[data-role]').forEach((b) => (b.onclick = () => { SFX.click(); queueOverlay((el, c) => roleOverlay(el, c, false, demoMe(b.dataset.role))); }));
  document.querySelectorAll('[data-demo]').forEach((b) => (b.onclick = () => { SFX.click(); DEMOS[b.dataset.demo](); }));
}

function rulesHtml() {
  return `<div class="rules">
    <p>Los jugadores se dividen en <b>leales a Arturo</b> y <b>secuaces de Mordred</b>. Los malvados se conocen entre sí; los leales no saben nada, salvo Merlín.</p>
    <p>Hay cinco misiones. En cada ronda el líder propone un equipo y todos votan. Si la mayoría aprueba, el equipo parte; si no, el liderazgo pasa al siguiente. <b>Cinco rechazos seguidos y gana el mal.</b></p>
    <p>En la misión, cada integrante juega en secreto Éxito o Fracaso; los leales sólo pueden jugar Éxito. Un Fracaso basta para que la misión falle (en la cuarta, con siete o más jugadores, hacen falta dos).</p>
    <p>Gana el primer bando en sumar tres misiones… pero si gana el bien, el Asesino tiene una última chance: si adivina quién es Merlín, gana el mal.</p></div>`;
}

// Ventana con pergamino para información secundaria (reglas, registro de la partida)
function infoOverlay(title, html) {
  SFX.click();
  queueOverlay((el, close) => {
    el.innerHTML = `<div class="sheet scroll"><h2 class="center">${title}</h2>${rule}<div class="sheet-body">${html}</div>
      <button class="btn dark" data-close style="margin-top:12px">Cerrar</button></div>`;
    el.querySelector('[data-close]').onclick = close;
    el.onclick = (e) => { if (e.target === el) close(); };
  });
}
const showRules = () => infoOverlay('¿Cómo se juega?', rulesHtml());

const ICON_RULES = `<svg viewBox="0 0 24 24"><path d="M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM6 3a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8h7M9 12h7M9 16h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

function renderHome() {
  const code = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
  const name = store.get('avalon.name') || '';
  $app.innerHTML = `
    <div class="hero">${ART.castle}</div>
    <div class="center"><div class="title">Avalon</div><div class="tagline">Lealtad y traición en la corte del Rey Arturo</div></div>
    <div class="scroll">
      <div class="row2">
        <div><label class="lbl" for="name">Tu nombre</label><input id="name" placeholder="Sir Lancelot…" maxlength="20" value="${esc(name)}" autocomplete="off" /></div>
        <div style="flex:0 0 38%"><label class="lbl" for="code">Sala</label><input id="code" placeholder="KQRT" maxlength="4" value="${esc(code)}" autocomplete="off" class="code-input" /></div>
      </div>
      <button class="btn" id="join" style="margin-top:12px">Entrar a la sala</button>
    </div>
    <button class="btn dark" id="create">Fundar una sala nueva</button>
    <div class="links">
      <button class="link" id="gallery">${ART.card('merlin')}<span>Galería de personajes</span></button>
      <button class="link" id="rules">${ICON_RULES}<span>¿Cómo se juega?</span></button>
    </div>`;
  const getName = () => { const n = document.getElementById('name').value.trim(); store.set('avalon.name', n); return n; };
  document.getElementById('join').onclick = () => send('join', { name: getName(), code: document.getElementById('code').value });
  document.getElementById('create').onclick = () => send('create', { name: getName() });
  document.getElementById('gallery').onclick = () => { SFX.click(); showGallery = true; render(); $app.scrollTop = 0; };
  document.getElementById('rules').onclick = showRules;
}

function playerRow(p, extra = '', cls = '') {
  const me = p.id === S.meId;
  return `<li class="${cls}${me ? ' me' : ''}" data-id="${p.id}" ${me ? 'title="Vos"' : ''}>${ART.shield(p.name)}<span class="name">${esc(p.name)}</span>${extra}</li>`;
}

function topbar(right = '') {
  return `<div class="topbar"><span class="deco">Avalon</span><span class="tb-btns">${right}</span></div>`;
}

function renderLobby() {
  const isHost = S.hostId === S.meId;
  const n = S.players.length;
  const o = S.options;
  const evilN = EVIL_COUNT[Math.min(Math.max(n, 5), 10)];
  const link = location.origin + '/?sala=' + S.code;
  const opt = (k, label, desc) => `
    <label class="toggle"><span class="mini">${ART.card(k)}</span><span class="txt"><b class="cz">${label}</b><span class="small muted it">${desc}</span></span>
    <span class="switch"><input type="checkbox" data-opt="${k}" ${o[k] ? 'checked' : ''} ${isHost ? '' : 'disabled'}><span></span></span></label>`;
  $app.innerHTML = `
    ${topbar(`<button class="tb" id="rules" title="Reglas">${ICON_RULES}</button><button class="tb txt" id="leave">Salir</button>`)}
    <div class="scroll code-row">
      <div><span class="lbl">Sala</span><div class="code">${S.code}</div></div>
      <button class="btn dark small" id="share">Invitar</button>
    </div>
    <div class="scroll">
      <h2>Caballeros reunidos <span class="muted">${n}/10</span></h2>
      <ul class="players grid">${S.players.map((p) => playerRow(p,
        (p.id === S.hostId ? `<span class="ic" title="Anfitrión">${ART.icon.crown}</span>` : '') +
        (isHost && p.id !== S.meId ? `<button class="kick" data-kick="${p.id}" title="Echar">✕</button>` : ''))).join('')}</ul>
      ${n < 5 ? `<div class="small muted it center" style="margin-top:6px">Faltan ${5 - n} para poder empezar</div>` : ''}
    </div>
    <div class="scroll">
      <h2>Personajes <span class="small muted it" style="font-family:'IM Fell English';letter-spacing:0">· Merlín y Asesino siempre · ${evilN} malvados</span></h2>
      ${opt('percival', 'Percival', 'Ve a Merlín (y a Morgana)')}
      ${opt('morgana', 'Morgana', 'Se hace pasar por Merlín')}
      ${opt('mordred', 'Mordred', 'Invisible para Merlín')}
      ${opt('oberon', 'Oberón', 'Malvado solitario')}
    </div>`;
  setFab(isHost
    ? `<button class="btn" id="start" ${n < 5 || n > 10 ? 'disabled' : ''}>Comenzar la partida</button>`
    : `<div class="wait">Esperando que el anfitrión comience…${isHost ? '' : '<br><span class="small">Sólo el anfitrión elige los personajes.</span>'}</div>`);

  document.getElementById('share').onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Avalon', text: `Sumate a Avalon, sala ${S.code}`, url: link });
      else { await navigator.clipboard.writeText(link); toast('Link copiado', true); }
    } catch {}
  };
  document.getElementById('rules').onclick = showRules;
  document.querySelectorAll('[data-opt]').forEach((el) => (el.onchange = () => send('setOptions', { [el.dataset.opt]: el.checked })));
  document.querySelectorAll('[data-kick]').forEach((el) => (el.onclick = () => send('kick', el.dataset.kick)));
  document.getElementById('leave').onclick = async () => { await send('leave'); forgetRoom(); };
  const st = document.getElementById('start'); if (st) st.onclick = () => send('start');
}

const ICON_OK = `<svg viewBox="0 0 24 24"><path d="M5 6h14c0 7-3 10-7 11-4-1-7-4-7-11z" fill="#f6e7bd"/><path d="M10 17h4v3h-4z" fill="#f6e7bd"/></svg>`;
const ICON_KO = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#f6e7bd" stroke-width="3" stroke-linecap="round"/></svg>`;
const ICON_CHECK = `<svg viewBox="0 0 24 24" class="ico"><path d="M5 12l5 5 9-10" fill="none" stroke="#5a7a2a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_LOG = `<svg viewBox="0 0 24 24"><path d="M5 4h12l2 2v14H5z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

function boardHtml(g) {
  const quests = g.questSizes.map((size, i) => {
    const r = g.results[i];
    const cur = !r && i === g.questIdx && !['end', 'assassin'].includes(g.phase);
    const cls = r ? (r.success ? 'ok' : 'ko') : cur ? 'cur' : '';
    return `<div class="quest ${cls}">${r ? (r.success ? ICON_OK : ICON_KO) : size}${g.failsNeeded[i] > 1 && !r ? '<span class="need">2 ✗</span>' : ''}</div>`;
  }).join('');
  const rej = [0, 1, 2, 3, 4].map((i) => `<i class="${i < g.rejections ? 'on' : ''} ${i === 4 && g.rejections === 4 ? 'danger' : ''}"></i>`).join('');
  return `<div class="scroll board"><div class="quests">${quests}</div><div class="rej">Rechazos ${rej}</div></div>`;
}

// Registro de la partida: misiones jugadas, última votación y personajes en juego
function showLog() {
  const g = S.game;
  const lv = g.lastVote;
  const quests = g.results.length
    ? g.results.map((r, i) => `<div class="log-row"><span class="tag ${r.success ? 'good' : 'evil'}">${i + 1} · ${r.success ? 'Éxito' : 'Fracaso'}</span><span class="small">${list(r.team)}${r.fails ? ` <i class="muted">(${r.fails} ✗)</i>` : ''}</span></div>`).join('')
    : '<div class="small muted it">Todavía no hubo misiones.</div>';
  const vote = lv
    ? `<div class="small muted it" style="margin-bottom:6px">Equipo de ${nameOf(lv.leader)}: ${list(lv.team)} — ${lv.approved ? 'aprobado' : 'rechazado'}</div>
       <div class="vote-grid">${g.order.map((id) => `<span>${nameOf(id)}</span><span class="tag ${lv.votes[id] ? 'good' : 'evil'}">${lv.votes[id] ? 'Aprueba' : 'Rechaza'}</span>`).join('')}</div>`
    : '<div class="small muted it">Todavía no hubo votaciones.</div>';
  const roles = Object.entries(g.rolesInPlay).map(([r, c]) => `${ROLE_NAMES[r]}${c > 1 ? ' ×' + c : ''}`).join(' · ');
  infoOverlay('Registro', `
    <h3>Misiones</h3>${quests}
    <h3>Última votación</h3>${vote}
    <h3>Personajes en juego</h3><div class="small">${roles}</div>
    <div class="small muted it" style="margin-top:12px">Sala ${S.code}</div>`);
}

function renderGame() {
  const g = S.game;
  const isLeader = g.leader === S.meId;
  const byId = Object.fromEntries(S.players.map((p) => [p.id, p]));
  let phase = '';
  let listMode = null;

  switch (g.phase) {
    case 'team': {
      const size = g.questSizes[g.questIdx];
      phase = `<h2>Misión ${g.questIdx + 1} · equipo de ${size}</h2>
        <div class="who">${isLeader ? `<b>Sos el líder.</b> Tocá ${size} caballeros para la misión.` : `<b>${nameOf(g.leader)}</b> está eligiendo el equipo…`}</div>`;
      if (isLeader) {
        listMode = 'team';
        setFab(`<button class="btn" id="propose" ${selected.size !== size ? 'disabled' : ''}>Proponer equipo (${selected.size}/${size})</button>`);
      }
      break;
    }
    case 'vote': {
      phase = `<h2>Votación</h2><div class="who"><b>${nameOf(g.leader)}</b> propone a <b>${list(g.team)}</b></div>
        <div class="small muted it">Votaron ${g.votedIds.length} de ${g.order.length}${g.rejections === 4 ? ' · <span style="color:var(--red)">¡si se rechaza, gana el mal!</span>' : ''}</div>`;
      setFab(g.myVote === null
        ? `<div class="choice"><button data-vote="1">${ART.seal(true)}Aprobar</button><button data-vote="0">${ART.seal(false)}Rechazar</button></div>`
        : `<div class="wait">Sellaste tu voto: <b>${g.myVote ? 'Aprobar' : 'Rechazar'}</b>. Esperando al resto…</div>`);
      break;
    }
    case 'quest': {
      const inTeam = g.team.includes(S.meId);
      phase = `<h2>Misión ${g.questIdx + 1} en marcha</h2><div class="who">Partieron <b>${list(g.team)}</b></div>
        <div class="small muted it">Cartas jugadas: ${g.playedIds.length} de ${g.team.length}</div>`;
      if (inTeam && !g.myCardPlayed) {
        const good = g.me.team === 'good';
        setFab(`<div class="choice cards"><button data-card="1"><span class="qcard">${ART.questCard(true)}</span></button><button data-card="0" ${good ? 'disabled' : ''}><span class="qcard">${ART.questCard(false)}</span></button></div>
          <div class="wait small">Elegí en secreto${good ? ' · los leales sólo juegan Éxito' : ''}</div>`);
      } else if (inTeam) setFab(`<div class="wait">Tu carta está boca abajo. Esperando al resto…</div>`);
      break;
    }
    case 'assassin': {
      const amAssassin = g.me?.role === 'assassin';
      phase = `<h2>¡El bien ganó tres misiones!</h2><div class="who"><b>${nameOf(g.assassin)}</b> es el Asesino. Los malvados deliberan en voz alta: ¿quién es Merlín?</div>`;
      if (amAssassin) {
        listMode = 'assassin';
        setFab(`<button class="btn" id="kill" style="background:linear-gradient(180deg,#e04a3a,#7a1410);color:#fff;text-shadow:none" ${selected.size !== 1 ? 'disabled' : ''}>${selected.size ? 'Asesinar a ' + nameOf([...selected][0]) : 'Elegí a tu víctima'}</button>`);
      }
      break;
    }
    case 'end': {
      const isHost = S.hostId === S.meId;
      phase = `<div class="center"><div class="deco" style="font-size:26px;color:${g.winner === 'good' ? 'var(--blue)' : 'var(--red)'}">${g.winner === 'good' ? 'Gana el Bien' : 'Gana el Mal'}</div>
        <div class="it">${esc(g.winReason)}${g.assassinTarget ? ` · el Asesino señaló a ${nameOf(g.assassinTarget)}` : ''}</div></div>`;
      setFab(isHost ? `<button class="btn" id="again">Volver a la sala</button>` : `<div class="wait">Esperando al anfitrión…</div>`);
      break;
    }
  }

  const rows = g.order.map((id) => {
    const p = byId[id] || { id, name: '¿?' };
    let tags = '';
    if (id === g.leader && !['end', 'assassin'].includes(g.phase)) tags += `<span class="ic" title="Líder">${ART.icon.crown}</span>`;
    if (g.team.includes(id) && (g.phase === 'vote' || g.phase === 'quest')) tags += `<span class="ic" title="En el equipo">${ART.icon.sword}</span>`;
    if ((g.phase === 'vote' && g.votedIds.includes(id)) || (g.phase === 'quest' && g.playedIds.includes(id))) tags += `<span class="ic" title="Listo">${ICON_CHECK}</span>`;
    if (g.phase === 'end') tags += `<span class="tag ${EVIL.includes(g.roles[id]) ? 'evil' : 'good'}">${ROLE_NAMES[g.roles[id]]}</span>`;
    let cls = '';
    const known = g.me?.night?.ids || [];
    const canPick = listMode === 'team' || (listMode === 'assassin' && id !== S.meId && !known.includes(id));
    if (canPick) cls += ' clickable';
    if (selected.has(id)) cls += ' sel';
    return playerRow(p, tags, cls);
  }).join('');

  const myCard = g.me && g.phase !== 'end' ? `<button class="tb card-btn" id="peek" title="Tu personaje">${ART.card('back')}<span>Mi carta</span></button>` : '';
  $app.innerHTML = `
    ${topbar(`${myCard}<button class="tb" id="log" title="Registro">${ICON_LOG}</button>`)}
    <div class="game-grid">
      <div class="g-left">${boardHtml(g)}<div class="scroll phase">${phase}</div></div>
      <div class="scroll g-right"><ul class="players grid ${g.phase === 'end' ? 'end' : ''}">${rows}</ul></div>
    </div>`;

  const peek = document.getElementById('peek');
  if (peek) peek.onclick = () => { SFX.click(); queueOverlay((el, close) => roleOverlay(el, close, false)); };
  document.getElementById('log').onclick = showLog;
  document.querySelectorAll('.players li.clickable').forEach((li) => (li.onclick = () => {
    const id = li.dataset.id;
    if (listMode === 'assassin') selected = new Set(selected.has(id) ? [] : [id]);
    else if (selected.has(id)) selected.delete(id);
    else if (selected.size < g.questSizes[g.questIdx]) selected.add(id);
    SFX.click();
    render();
  }));
  document.querySelectorAll('[data-vote]').forEach((b) => (b.onclick = () => send('vote', b.dataset.vote === '1')));
  document.querySelectorAll('[data-card]').forEach((b) => (b.onclick = () => send('questCard', b.dataset.card === '1')));
  const pr = document.getElementById('propose'); if (pr) pr.onclick = () => send('propose', [...selected]);
  const k = document.getElementById('kill'); if (k) k.onclick = () => send('assassinate', [...selected][0]);
  const a = document.getElementById('again'); if (a) a.onclick = () => send('backToLobby');
}

render();
poll();
