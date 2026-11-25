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
const nameOf = (id) => esc(S.players.find((p) => p.id === id)?.name ?? '¿?');
const rawName = (id) => S.players.find((p) => p.id === id)?.name ?? '?';
const list = (ids) => ids.map(nameOf).join(', ');
const rule = '<div class="rule"><i></i></div>';
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast'; t.textContent = msg;
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
async function send(action, arg) {
  if (busy) return;
  busy = true;
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
function roleOverlay(el, close, intro) {
  const me = S.game?.me;
  if (!me) return close();
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
    el.className = 'overlay' + (open ? ' role-' + me.role : '');
    fx.innerHTML = open ? particles(ROLE_PARTICLES[me.role], me.role === 'oberon' || me.role === 'morgana' ? 18 : 30) : '';
    tap.textContent = open ? 'Tocá la carta para ocultarla' : 'Tocá la carta para revelarla';
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
  items.forEach((it, i) => setTimeout(() => it.classList.add('show'), 500 + i * 160));
  const t = 700 + items.length * 160;
  setTimeout(() => el.querySelector('.verdict').classList.add('show'), t);
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
    if (!cards[i] && navigator.vibrate) navigator.vibrate(60);
  }, 1100 + i * 750));
  const t = 1300 + flips.length * 750;
  setTimeout(() => {
    el.querySelector('.verdict').classList.add('show');
    el.querySelector('.fx').innerHTML = particles(result.success ? 'gold' : 'embers', 30);
    for (const sel of ['[data-sum]', '[data-close]']) { const x = el.querySelector(sel); x.style.transition = 'opacity .4s'; x.style.opacity = 1; }
  }, t);
  el.querySelector('[data-close]').onclick = close;
}

function endOverlay(el, close, g) {
  const good = g.winner === 'good';
  el.innerHTML = `
    <div class="ov-title" style="font-size:36px;color:${good ? '#9cc8ff' : '#ff7a6a'}">${good ? 'Gana el Bien' : 'Gana el Mal'}</div>
    <div class="ov-sub">${esc(g.winReason)}${g.assassinTarget ? `. El Asesino señaló a ${nameOf(g.assassinTarget)}.` : '.'}</div>
    <div class="end-grid">${g.order.map((id, i) => `
      <div class="pc ${id === g.assassinTarget ? 'target' : ''}" style="animation-delay:${0.4 + i * 0.12}s">${ART.card(g.roles[id])}<div class="pn">${nameOf(id)}</div></div>`).join('')}</div>
    <button class="btn" data-close>Ver el tablero</button>
    <div class="fx">${particles(good ? 'gold' : 'embers', 40)}</div>`;
  if (navigator.vibrate) navigator.vibrate([40, 60, 40, 60, 120]);
  el.querySelector('[data-close]').onclick = close;
}

// ================= Pantallas =================
function render() {
  $fab.innerHTML = '';
  if (!S) return renderHome();
  if (!S.game) return renderLobby();
  renderGame();
}
const setFab = (html) => ($fab.innerHTML = `<div class="fab"><div class="inner">${html}</div></div>`);

function rulesHtml() {
  return `<div class="small" style="margin-top:10px">
    <p>Los jugadores se dividen en <b>leales a Arturo</b> y <b>secuaces de Mordred</b>. Los malvados se conocen entre sí; los leales no saben nada, salvo Merlín.</p>
    <p>Hay cinco misiones. En cada ronda el líder propone un equipo y todos votan. Si la mayoría aprueba, el equipo parte; si no, el liderazgo pasa al siguiente. <b>Cinco rechazos seguidos y gana el mal.</b></p>
    <p>En la misión, cada integrante juega en secreto Éxito o Fracaso; los leales sólo pueden jugar Éxito. Un Fracaso basta para que la misión falle (en la cuarta, con siete o más jugadores, hacen falta dos).</p>
    <p>Gana el primer bando en sumar tres misiones… pero si gana el bien, el Asesino tiene una última chance: si adivina quién es Merlín, gana el mal.</p></div>`;
}

function renderHome() {
  const code = (new URLSearchParams(location.search).get('sala') || '').toUpperCase();
  const name = store.get('avalon.name') || '';
  $app.innerHTML = `
    <div class="hero">${ART.castle}</div>
    <div class="center"><div class="title">Avalon</div><div class="tagline">Lealtad y traición en la corte del Rey Arturo</div></div>
    <div class="scroll">
      <label class="lbl" for="name">Tu nombre</label>
      <input id="name" placeholder="Sir Lancelot…" maxlength="20" value="${esc(name)}" autocomplete="off" />
      ${rule}
      <label class="lbl" for="code">Código de la sala</label>
      <input id="code" placeholder="KQRT" maxlength="4" value="${esc(code)}" autocomplete="off" style="text-transform:uppercase;letter-spacing:.3em;font-family:Cinzel,serif" />
      <div style="height:12px"></div>
      <button class="btn" id="join">Entrar a la sala</button>
    </div>
    <div class="or">— o bien —</div>
    <button class="btn dark" id="create">Fundar una sala nueva</button>
    <details class="scroll" style="margin-top:26px"><summary>¿Cómo se juega?</summary>${rulesHtml()}</details>`;
  const getName = () => { const n = document.getElementById('name').value.trim(); store.set('avalon.name', n); return n; };
  document.getElementById('join').onclick = () => send('join', { name: getName(), code: document.getElementById('code').value });
  document.getElementById('create').onclick = () => send('create', { name: getName() });
}

function playerRow(p, extra = '', cls = '') {
  return `<li class="${cls}" data-id="${p.id}">${ART.shield(p.name)}<span class="name">${esc(p.name)}${p.id === S.meId ? ' <span class="muted it">(vos)</span>' : ''}</span>${extra}</li>`;
}

function renderLobby() {
  const isHost = S.hostId === S.meId;
  const n = S.players.length;
  const o = S.options;
  const evilN = EVIL_COUNT[Math.min(Math.max(n, 5), 10)];
  const link = location.origin + '/?sala=' + S.code;
  const opt = (k, label, desc) => `
    <label class="toggle"><span class="mini">${ART.card(k)}</span><span class="txt"><span class="cz" style="font-weight:800">${label}</span><br><span class="small muted it">${desc}</span></span>
    <span class="switch"><input type="checkbox" data-opt="${k}" ${o[k] ? 'checked' : ''} ${isHost ? '' : 'disabled'}><span></span></span></label>`;
  $app.innerHTML = `
    <div class="topbar"><span class="deco">Avalon</span><span class="night-muted small it">la corte se reúne</span></div>
    <div class="scroll center">
      <label class="lbl">Código de la sala</label>
      <div class="code">${S.code}</div>
      <button class="btn dark small" id="share">Compartir invitación</button>
    </div>
    <div class="scroll">
      <h2>Caballeros reunidos <span class="muted">${n}/10</span></h2>
      <ul class="players">${S.players.map((p) => playerRow(p,
        (p.id === S.hostId ? `<span class="tag gold">${ART.icon.crown} anfitrión</span>` : '') +
        (isHost && p.id !== S.meId ? `<button class="kick" data-kick="${p.id}" title="Echar">✕</button>` : ''))).join('')}</ul>
      ${n < 5 ? `<div class="small muted it center" style="margin-top:10px">Faltan ${5 - n} para poder empezar</div>` : ''}
    </div>
    <div class="scroll">
      <h2>Personajes</h2>
      <div class="small muted it">Siempre juegan Merlín y el Asesino. Con ${Math.max(n, 5)} jugadores hay ${evilN} malvados.</div>
      ${rule}
      ${opt('percival', 'Percival', 'Ve a Merlín (y a Morgana, sin saber cuál es cuál)')}
      ${opt('morgana', 'Morgana', 'Se hace pasar por Merlín ante Percival')}
      ${opt('mordred', 'Mordred', 'Invisible para Merlín')}
      ${opt('oberon', 'Oberón', 'Malvado solitario: nadie lo conoce')}
      ${!isHost ? '<div class="small muted it">Sólo el anfitrión elige los personajes.</div>' : ''}
    </div>
    <details class="scroll"><summary>¿Cómo se juega?</summary>${rulesHtml()}</details>
    <button class="btn dark" id="leave" style="margin-top:8px">Abandonar la sala</button>`;
  setFab(isHost
    ? `<button class="btn" id="start" ${n < 5 || n > 10 ? 'disabled' : ''}>Comenzar la partida</button>`
    : `<div class="wait">Esperando que el anfitrión comience…</div>`);

  document.getElementById('share').onclick = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Avalon', text: `Sumate a Avalon, sala ${S.code}`, url: link });
      else { await navigator.clipboard.writeText(link); toast('Link copiado'); }
    } catch {}
  };
  document.querySelectorAll('[data-opt]').forEach((el) => (el.onchange = () => send('setOptions', { [el.dataset.opt]: el.checked })));
  document.querySelectorAll('[data-kick]').forEach((el) => (el.onclick = () => send('kick', el.dataset.kick)));
  document.getElementById('leave').onclick = async () => { await send('leave'); forgetRoom(); };
  const st = document.getElementById('start'); if (st) st.onclick = () => send('start');
}

const ICON_OK = `<svg viewBox="0 0 24 24"><path d="M5 6h14c0 7-3 10-7 11-4-1-7-4-7-11z" fill="#f6e7bd"/><path d="M10 17h4v3h-4z" fill="#f6e7bd"/></svg>`;
const ICON_KO = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="#f6e7bd" stroke-width="3" stroke-linecap="round"/></svg>`;

function boardHtml(g) {
  const quests = g.questSizes.map((size, i) => {
    const r = g.results[i];
    const cur = !r && i === g.questIdx && !['end', 'assassin'].includes(g.phase);
    const cls = r ? (r.success ? 'ok' : 'ko') : cur ? 'cur' : '';
    return `<div class="quest ${cls}">${r ? (r.success ? ICON_OK : ICON_KO) : size}${g.failsNeeded[i] > 1 && !r ? '<span class="need">2 fracasos</span>' : ''}</div>`;
  }).join('');
  const rej = [0, 1, 2, 3, 4].map((i) => `<i class="${i < g.rejections ? 'on' : ''} ${i === 4 && g.rejections === 4 ? 'danger' : ''}"></i>`).join('');
  return `<div class="scroll"><div class="quests">${quests}</div><div class="rej">Rechazos ${rej}</div></div>`;
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
        <div class="who">${isLeader ? `<b>Sos el líder.</b> Elegí ${size} caballeros para la misión.` : `<b>${nameOf(g.leader)}</b> está eligiendo el equipo…`}</div>`;
      if (isLeader) {
        listMode = 'team';
        setFab(`<button class="btn" id="propose" ${selected.size !== size ? 'disabled' : ''}>Proponer equipo (${selected.size}/${size})</button>`);
      }
      break;
    }
    case 'vote': {
      phase = `<h2>Votación</h2><div class="who"><b>${nameOf(g.leader)}</b> propone: <b>${list(g.team)}</b></div>
        <div class="small muted it" style="margin-top:4px">Votaron ${g.votedIds.length} de ${g.order.length}${g.rejections === 4 ? ' · <span style="color:var(--red)">¡si se rechaza, gana el mal!</span>' : ''}</div>`;
      setFab(g.myVote === null
        ? `<div class="choice"><button data-vote="1">${ART.seal(true)}Aprobar</button><button data-vote="0">${ART.seal(false)}Rechazar</button></div>`
        : `<div class="wait">Sellaste tu voto: <b>${g.myVote ? 'Aprobar' : 'Rechazar'}</b>. Esperando al resto…</div>`);
      break;
    }
    case 'quest': {
      const inTeam = g.team.includes(S.meId);
      phase = `<h2>Misión ${g.questIdx + 1} en marcha</h2><div class="who">Partieron <b>${list(g.team)}</b></div>
        <div class="small muted it" style="margin-top:4px">Cartas jugadas: ${g.playedIds.length} de ${g.team.length}</div>`;
      if (inTeam && !g.myCardPlayed) {
        const good = g.me.team === 'good';
        setFab(`<div class="wait small" style="margin-bottom:10px">Elegí tu carta en secreto${good ? ' (los leales sólo pueden jugar Éxito)' : ''}</div>
          <div class="choice cards"><button data-card="1"><span class="qcard">${ART.questCard(true)}</span></button><button data-card="0" ${good ? 'disabled' : ''}><span class="qcard">${ART.questCard(false)}</span></button></div>`);
      } else if (inTeam) setFab(`<div class="wait">Tu carta está boca abajo. Esperando al resto del equipo…</div>`);
      break;
    }
    case 'assassin': {
      const amAssassin = g.me?.role === 'assassin';
      phase = `<h2>¡El bien ganó tres misiones!</h2><div class="who"><b>${nameOf(g.assassin)}</b> es el Asesino. Los malvados pueden deliberar en voz alta: ¿quién es Merlín?</div>`;
      if (amAssassin) {
        listMode = 'assassin';
        setFab(`<button class="btn" id="kill" style="background:linear-gradient(180deg,#e04a3a,#7a1410);color:#fff;text-shadow:none" ${selected.size !== 1 ? 'disabled' : ''}>${selected.size ? 'Asesinar a ' + nameOf([...selected][0]) : 'Elegí a tu víctima'}</button>`);
      }
      break;
    }
    case 'end': {
      const isHost = S.hostId === S.meId;
      phase = `<div class="center"><div class="deco" style="font-size:30px;color:${g.winner === 'good' ? 'var(--blue)' : 'var(--red)'}">${g.winner === 'good' ? 'Gana el Bien' : 'Gana el Mal'}</div>
        <div class="it">${esc(g.winReason)}</div>${g.assassinTarget ? `<div class="small muted it">El Asesino señaló a ${nameOf(g.assassinTarget)}</div>` : ''}</div>`;
      setFab(isHost ? `<button class="btn" id="again">Volver a la sala</button>` : `<div class="wait">Esperando al anfitrión…</div>`);
      break;
    }
  }

  const rows = g.order.map((id) => {
    const p = byId[id] || { id, name: '¿?' };
    let tags = '';
    if (id === g.leader && !['end', 'assassin'].includes(g.phase)) tags += `<span class="tag gold">${ART.icon.crown} líder</span>`;
    if (g.team.includes(id) && (g.phase === 'vote' || g.phase === 'quest')) tags += `<span class="tag">${ART.icon.sword}</span>`;
    if (g.phase === 'vote' && g.votedIds.includes(id)) tags += '<span class="tag">votó</span>';
    if (g.phase === 'quest' && g.playedIds.includes(id)) tags += '<span class="tag">jugó</span>';
    if (g.phase === 'end') tags += `<span class="tag ${EVIL.includes(g.roles[id]) ? 'evil' : 'good'}">${ROLE_NAMES[g.roles[id]]}</span>`;
    let cls = '';
    const known = g.me?.night?.ids || [];
    const canPick = listMode === 'team' || (listMode === 'assassin' && id !== S.meId && !known.includes(id));
    if (canPick) cls += ' clickable';
    if (selected.has(id)) cls += ' sel';
    return playerRow(p, tags, cls);
  }).join('');

  const lv = g.lastVote;
  const lastVoteHtml = lv ? `<details class="scroll"><summary>Última votación: ${lv.approved ? 'aprobada' : 'rechazada'}</summary>
      <div class="small muted it" style="margin-top:8px">Equipo de ${nameOf(lv.leader)}: ${list(lv.team)}</div>
      <div class="vote-grid">${g.order.map((id) => `<span>${nameOf(id)}</span><span class="tag ${lv.votes[id] ? 'good' : 'evil'}">${lv.votes[id] ? 'Aprueba' : 'Rechaza'}</span>`).join('')}</div></details>` : '';

  $app.innerHTML = `
    <div class="topbar"><span class="deco">Avalon</span><span class="night-muted small">Sala ${S.code}</span></div>
    ${boardHtml(g)}
    <div class="scroll phase">${phase}</div>
    <div class="scroll"><ul class="players">${rows}</ul></div>
    ${g.me && g.phase !== 'end' ? `<div class="scroll peek" id="peek"><span class="thumb">${ART.card('back')}</span>
      <span><span class="cz" style="font-weight:800">Tu personaje</span><br><span class="small muted it">Tocá para verlo en secreto</span></span></div>` : ''}
    ${lastVoteHtml}
    <details class="scroll"><summary>Personajes en juego</summary><div class="small" style="margin-top:8px">${Object.entries(g.rolesInPlay).map(([r, c]) => `${ROLE_NAMES[r]}${c > 1 ? ' ×' + c : ''}`).join(' · ')}</div></details>`;

  const peek = document.getElementById('peek');
  if (peek) peek.onclick = () => queueOverlay((el, close) => roleOverlay(el, close, false));
  document.querySelectorAll('.players li.clickable').forEach((li) => (li.onclick = () => {
    const id = li.dataset.id;
    if (listMode === 'assassin') selected = new Set(selected.has(id) ? [] : [id]);
    else if (selected.has(id)) selected.delete(id);
    else if (selected.size < g.questSizes[g.questIdx]) selected.add(id);
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
