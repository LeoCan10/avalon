// Endpoint único: GET = leer estado (polling), POST = acción.
const crypto = require('crypto');
const G = require('../game');
const store = require('../lib/store');

const newId = () => crypto.randomBytes(8).toString('hex');
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('');
const cleanName = (n) => String(n || '').trim().slice(0, 20);
const cleanCode = (c) => String(c || '').toUpperCase().trim();

class UserError extends Error {}
const fail = (m) => { throw new UserError(m); };

function publicRoom(room, ver, viewer) {
  return {
    ver,
    code: room.code,
    hostId: room.hostId,
    meId: viewer.id,
    options: room.options,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    game: room.game ? G.viewFor(room.game, viewer.id) : null,
  };
}

// Lee-modifica-escribe con reintentos si otro jugador escribió en el medio.
async function mutate(code, fn) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const cur = await store.get(code);
    if (!cur) fail('No existe esa sala');
    const result = fn(cur.room);
    if (await store.cas(code, cur.ver, cur.room)) return { room: cur.room, ver: cur.ver + 1, result };
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
  }
  fail('El servidor está ocupado, probá de nuevo');
}

const byToken = (room, token) => (token && room.players.find((p) => p.token === token)) || null;

const ACTIONS = {
  setOptions(room, me, { options }) {
    host(room, me);
    if (room.game) fail('La partida ya empezó');
    for (const k of ['percival', 'morgana', 'mordred', 'oberon']) if (options && k in options) room.options[k] = !!options[k];
  },
  kick(room, me, { target }) {
    host(room, me);
    if (room.game) fail('No se puede echar en plena partida');
    if (target !== me.id) room.players = room.players.filter((p) => p.id !== target);
  },
  start(room, me) {
    host(room, me);
    if (room.game) fail('La partida ya empezó');
    room.game = G.startGame(room.players.map((p) => p.id), room.options);
  },
  backToLobby(room, me) {
    host(room, me);
    room.game = null;
  },
  leave(room, me) {
    if (room.game) fail('No podés salir en plena partida');
    room.players = room.players.filter((p) => p.id !== me.id);
    if (room.hostId === me.id && room.players[0]) room.hostId = room.players[0].id;
  },
  propose: (room, me, { team }) => game(room, (g) => G.proposeTeam(g, me.id, team)),
  vote: (room, me, { approve }) => game(room, (g) => G.castVote(g, me.id, approve)),
  questCard: (room, me, { success }) => game(room, (g) => G.playQuestCard(g, me.id, success)),
  assassinate: (room, me, { target }) => game(room, (g) => G.assassinate(g, me.id, target)),
};

function host(room, me) {
  if (room.hostId !== me.id) fail('Sólo el anfitrión puede hacer eso');
}
function game(room, fn) {
  if (!room.game) fail('No hay partida en curso');
  try { fn(room.game); } catch (e) { fail(e.message); }
}

async function handle(method, q, body) {
  if (method === 'GET') {
    const cur = await store.get(cleanCode(q.code));
    if (!cur) fail('No existe esa sala');
    const me = byToken(cur.room, q.token);
    if (!me) return { status: 410, body: { error: 'Ya no estás en esta sala' } };
    if (q.ver && Number(q.ver) === cur.ver) return { body: { same: true } };
    return { body: publicRoom(cur.room, cur.ver, me) };
  }

  const { action } = body;

  if (action === 'create') {
    const name = cleanName(body.name) || fail('Poné tu nombre');
    const player = { id: newId(), token: newId(), name };
    const room = { hostId: player.id, players: [player], options: { percival: true, morgana: true, mordred: false, oberon: false }, game: null };
    for (let i = 0; i < 10; i++) {
      room.code = newCode();
      if (await store.cas(room.code, 0, room)) return { body: { token: player.token, state: publicRoom(room, 1, player) } };
    }
    fail('No pude crear la sala, probá de nuevo');
  }

  const code = cleanCode(body.code);

  if (action === 'join') {
    let player;
    const { room, ver } = await mutate(code, (room) => {
      player = byToken(room, body.token);
      if (player) return; // reconexión
      if (room.game) fail('La partida ya empezó');
      const name = cleanName(body.name) || fail('Poné tu nombre');
      if (room.players.length >= G.MAX_PLAYERS) fail('La sala está llena');
      if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail('Ese nombre ya está en uso');
      player = { id: newId(), token: newId(), name };
      room.players.push(player);
    });
    return { body: { token: player.token, state: publicRoom(room, ver, player) } };
  }

  const fn = ACTIONS[action] || fail('Acción desconocida');
  let me;
  const { room, ver } = await mutate(code, (room) => {
    me = byToken(room, body.token) || fail('Ya no estás en esta sala');
    fn(room, me, body);
  });
  return { body: { state: publicRoom(room, ver, me) } };
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const out = await handle(req.method, req.query || {}, body || {});
    res.status(out.status || 200).json(out.body);
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  }
};
