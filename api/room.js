// Endpoint único: GET = leer estado (polling), POST = acción.
const crypto = require('crypto');
const G = require('../game');
const store = require('../lib/store');

const newId = () => crypto.randomBytes(8).toString('hex');
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const newCode = () => Array.from({ length: 4 }, () => LETTERS[crypto.randomInt(LETTERS.length)]).join('');
const cleanName = (n) => String(n || '').trim().slice(0, 20);
const cleanCode = (c) => String(c || '').toUpperCase().trim();

// Un jugador figura conectado si consultó hace menos de ONLINE_MS.
// Si el anfitrión no aparece por HOST_AWAY_MS, cualquier jugador puede hacer sus acciones.
const ONLINE_MS = Number(process.env.AVALON_ONLINE_MS) || 12 * 1000;
const HOST_AWAY_MS = Number(process.env.AVALON_HOST_AWAY_MS) || 60 * 1000;
const REQUEST_TTL_MS = 5 * 60 * 1000;

class UserError extends Error {}
const fail = (m) => { throw new UserError(m); };

const isOnline = (seen, id, now = Date.now()) => now - (seen[id] || 0) < ONLINE_MS;
const hostAway = (room, seen, now = Date.now()) => now - (seen[room.hostId] || 0) > HOST_AWAY_MS;
const liveRequests = (room, now = Date.now()) => (room.requests || []).filter((r) => now - r.at < REQUEST_TTL_MS);

function publicRoom(room, ver, viewer, seen) {
  const now = Date.now();
  const away = hostAway(room, seen, now);
  const canManage = room.hostId === viewer.id || away;
  return {
    ver,
    code: room.code,
    hostId: room.hostId,
    meId: viewer.id,
    options: room.options,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    game: room.game ? G.viewFor(room.game, viewer.id) : null,
    requests: canManage ? liveRequests(room, now).map((r) => ({ id: r.id, name: r.name })) : [],
    presence: presence(room, seen, now),
  };
}

// Lo que cambia sin modificar la sala: quién está conectado y si el anfitrión desapareció
function presence(room, seen, now = Date.now()) {
  return { online: room.players.filter((p) => isOnline(seen, p.id, now)).map((p) => p.id), hostAway: hostAway(room, seen, now) };
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
  setOptions(room, me, { options }, ctx) {
    host(room, me, ctx);
    if (room.game) fail('La partida ya empezó');
    for (const k of ['percival', 'morgana', 'mordred', 'oberon']) if (options && k in options) room.options[k] = !!options[k];
  },
  kick(room, me, { target }, ctx) {
    host(room, me, ctx);
    if (room.game) fail('No se puede echar en plena partida');
    if (target !== me.id) room.players = room.players.filter((p) => p.id !== target);
  },
  start(room, me, _, ctx) {
    host(room, me, ctx);
    if (room.game) fail('La partida ya empezó');
    room.game = G.startGame(room.players.map((p) => p.id), room.options);
  },
  backToLobby(room, me, _, ctx) {
    host(room, me, ctx);
    room.game = null;
  },
  leave(room, me) {
    if (room.game) fail('No podés salir en plena partida');
    room.players = room.players.filter((p) => p.id !== me.id);
    if (room.hostId === me.id && room.players[0]) room.hostId = room.players[0].id;
  },
  // El anfitrión acepta o rechaza que alguien recupere su lugar desde otro dispositivo
  resolveRequest(room, me, { requestId, approve }, ctx) {
    host(room, me, ctx);
    const req = liveRequests(room).find((r) => r.id === requestId) || fail('Ese pedido ya no existe');
    room.requests = (room.requests || []).filter((r) => r.id !== requestId);
    if (!approve) return;
    const player = room.players.find((p) => p.id === req.playerId) || fail('Ese jugador ya no está en la sala');
    room.replaced = [...(room.replaced || []).slice(-19), player.token];
    player.token = req.token;
  },
  propose: (room, me, { team }) => game(room, (g) => G.proposeTeam(g, me.id, team)),
  vote: (room, me, { approve }) => game(room, (g) => G.castVote(g, me.id, approve)),
  questCard: (room, me, { success }) => game(room, (g) => G.playQuestCard(g, me.id, success)),
  assassinate: (room, me, { target }) => game(room, (g) => G.assassinate(g, me.id, target)),
};

// Acciones de anfitrión. Si el anfitrión lleva un rato desconectado, quien la hace pasa a serlo.
function host(room, me, ctx) {
  if (room.hostId === me.id) return;
  if (hostAway(room, ctx.seen)) { room.hostId = me.id; return; }
  fail('Sólo el anfitrión puede hacer eso');
}
function game(room, fn) {
  if (!room.game) fail('No hay partida en curso');
  try { fn(room.game); } catch (e) { fail(e.message); }
}

async function handle(method, q, body) {
  if (method === 'GET') {
    const code = cleanCode(q.code);
    const cur = await store.get(code);
    if (!cur) fail('No existe esa sala');
    const me = byToken(cur.room, q.token);
    if (!me) {
      const req = liveRequests(cur.room).find((r) => r.token === q.token);
      if (req) {
        const hostName = cur.room.players.find((p) => p.id === cur.room.hostId)?.name;
        return { body: { pending: true, name: req.name, code, hostName } };
      }
      if ((cur.room.replaced || []).includes(q.token)) return { status: 410, body: { error: 'Tu lugar se abrió en otro dispositivo' } };
      return { status: 410, body: { error: 'Ya no estás en esta sala' } };
    }
    const seen = await store.touch(code, me.id);
    if (q.ver && Number(q.ver) === cur.ver) return { body: { same: true, presence: presence(cur.room, seen) } };
    return { body: publicRoom(cur.room, cur.ver, me, seen) };
  }

  const { action } = body;

  if (action === 'create') {
    const name = cleanName(body.name) || fail('Poné tu nombre');
    const player = { id: newId(), token: newId(), name };
    const room = { hostId: player.id, players: [player], options: { percival: true, morgana: true, mordred: false, oberon: false }, game: null };
    for (let i = 0; i < 10; i++) {
      room.code = newCode();
      if (await store.cas(room.code, 0, room)) {
        const seen = await store.touch(room.code, player.id);
        return { body: { token: player.token, state: publicRoom(room, 1, player, seen) } };
      }
    }
    fail('No pude crear la sala, probá de nuevo');
  }

  const code = cleanCode(body.code);

  if (action === 'join') {
    let player, request;
    const { room, ver } = await mutate(code, (room) => {
      player = byToken(room, body.token);
      request = null;
      if (player) return; // reconexión desde el mismo dispositivo
      const name = cleanName(body.name) || fail('Poné tu nombre');
      const existing = room.players.find((p) => p.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        // Alguien con ese nombre ya está: pedido para recuperar el lugar (lo aprueba el anfitrión)
        room.requests = liveRequests(room).filter((r) => r.playerId !== existing.id);
        if (room.requests.length >= 5) fail('Hay demasiados pedidos pendientes, probá en un rato');
        request = { id: newId(), token: newId(), playerId: existing.id, name: existing.name, at: Date.now() };
        room.requests.push(request);
        return;
      }
      if (room.game) fail('La partida ya empezó. Si estabas jugando, entrá con el mismo nombre que usaste.');
      if (room.players.length >= G.MAX_PLAYERS) fail('La sala está llena');
      player = { id: newId(), token: newId(), name };
      room.players.push(player);
    });
    if (request) {
      const hostName = room.players.find((p) => p.id === room.hostId)?.name;
      return { body: { token: request.token, code, pending: true, name: request.name, hostName } };
    }
    const seen = await store.touch(code, player.id);
    return { body: { token: player.token, state: publicRoom(room, ver, player, seen) } };
  }

  const fn = ACTIONS[action] || fail('Acción desconocida');
  const ctx = { seen: await store.seen(code) };
  let me;
  const { room, ver } = await mutate(code, (room) => {
    me = byToken(room, body.token) || fail('Ya no estás en esta sala');
    fn(room, me, body, ctx);
  });
  const seen = await store.touch(code, me.id);
  return { body: { state: publicRoom(room, ver, me, seen) } };
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
