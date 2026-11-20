// Lógica pura de Avalon: sin red, sin sockets. El servidor sólo llama a estas funciones.

const QUEST_SIZES = {
  5: [2, 3, 2, 3, 3],
  6: [2, 3, 4, 3, 4],
  7: [2, 3, 3, 4, 4],
  8: [3, 4, 4, 5, 5],
  9: [3, 4, 4, 5, 5],
  10: [3, 4, 4, 5, 5],
};
const EVIL_COUNT = { 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4 };

const ROLES = {
  merlin: { name: 'Merlín', team: 'good' },
  percival: { name: 'Percival', team: 'good' },
  servant: { name: 'Leal servidor de Arturo', team: 'good' },
  assassin: { name: 'Asesino', team: 'evil' },
  morgana: { name: 'Morgana', team: 'evil' },
  mordred: { name: 'Mordred', team: 'evil' },
  oberon: { name: 'Oberón', team: 'evil' },
  minion: { name: 'Esbirro de Mordred', team: 'evil' },
};

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 10;

function failsNeeded(nPlayers, questIndex) {
  return nPlayers >= 7 && questIndex === 3 ? 2 : 1;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// options: { percival, morgana, mordred, oberon } booleans
function buildRoleList(n, options) {
  const evilN = EVIL_COUNT[n];
  const goodN = n - evilN;
  const evil = ['assassin'];
  for (const r of ['morgana', 'mordred', 'oberon']) {
    if (options[r] && evil.length < evilN) evil.push(r);
  }
  while (evil.length < evilN) evil.push('minion');
  const good = ['merlin'];
  if (options.percival) good.push('percival');
  while (good.length < goodN) good.push('servant');
  return [...good, ...evil];
}

function startGame(playerIds, options) {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) throw new Error(`Hacen falta entre ${MIN_PLAYERS} y ${MAX_PLAYERS} jugadores`);
  const roles = shuffle(buildRoleList(n, options));
  const order = shuffle(playerIds);
  const roleOf = {};
  order.forEach((id, i) => (roleOf[id] = roles[i]));
  return {
    phase: 'team', // team | vote | quest | assassin | end
    order,
    roleOf,
    options,
    leaderIdx: Math.floor(Math.random() * n),
    questIdx: 0,
    rejections: 0,
    results: [], // {success, fails, team}
    team: [],
    votes: {},
    questCards: {},
    lastVote: null, // {team, votes, approved, leader}
    winner: null,
    winReason: null,
    assassinTarget: null,
    log: [],
  };
}

function teamOf(g, id) {
  return ROLES[g.roleOf[id]].team;
}

function leaderId(g) {
  return g.order[g.leaderIdx];
}

function questSize(g) {
  return QUEST_SIZES[g.order.length][g.questIdx];
}

// Qué sabe cada jugador al arrancar (la "noche").
function nightInfo(g, id) {
  const role = g.roleOf[id];
  const others = g.order.filter((p) => p !== id);
  const isEvil = (p) => teamOf(g, p) === 'evil';
  switch (role) {
    case 'merlin':
      return { label: 'Estos jugadores son malvados', ids: others.filter((p) => isEvil(p) && g.roleOf[p] !== 'mordred') };
    case 'percival':
      return {
        label: g.options.morgana ? 'Uno es Merlín y el otro Morgana' : 'Este es Merlín',
        ids: others.filter((p) => ['merlin', 'morgana'].includes(g.roleOf[p])),
      };
    case 'oberon':
    case 'servant':
      return null;
    default: // malvados que se conocen entre sí
      return { label: 'Tus compañeros malvados', ids: others.filter((p) => isEvil(p) && g.roleOf[p] !== 'oberon') };
  }
}

function proposeTeam(g, by, team) {
  if (g.phase !== 'team') throw new Error('No es momento de armar equipo');
  if (by !== leaderId(g)) throw new Error('Sólo el líder arma el equipo');
  const uniq = [...new Set(team)];
  if (uniq.length !== questSize(g) || !uniq.every((p) => g.order.includes(p)))
    throw new Error(`El equipo debe tener ${questSize(g)} jugadores`);
  g.team = uniq;
  g.votes = {};
  g.phase = 'vote';
}

function castVote(g, by, approve) {
  if (g.phase !== 'vote') throw new Error('No hay votación abierta');
  if (!g.order.includes(by)) throw new Error('No estás en la partida');
  g.votes[by] = !!approve;
  if (Object.keys(g.votes).length < g.order.length) return;

  const yes = Object.values(g.votes).filter(Boolean).length;
  const approved = yes > g.order.length / 2;
  g.lastVote = { team: g.team, votes: { ...g.votes }, approved, leader: leaderId(g), quest: g.questIdx };
  if (approved) {
    g.rejections = 0;
    g.questCards = {};
    g.phase = 'quest';
  } else {
    g.rejections++;
    if (g.rejections >= 5) return finish(g, 'evil', 'Se rechazaron 5 equipos seguidos');
    nextLeader(g);
  }
}

function playQuestCard(g, by, success) {
  if (g.phase !== 'quest') throw new Error('No hay misión en curso');
  if (!g.team.includes(by)) throw new Error('No estás en esta misión');
  if (!success && teamOf(g, by) === 'good') throw new Error('Los leales sólo pueden jugar éxito');
  g.questCards[by] = !!success;
  if (Object.keys(g.questCards).length < g.team.length) return;

  const fails = Object.values(g.questCards).filter((c) => !c).length;
  const ok = fails < failsNeeded(g.order.length, g.questIdx);
  g.results.push({ success: ok, fails, team: g.team });
  g.questCards = {};
  const wins = g.results.filter((r) => r.success).length;
  const losses = g.results.length - wins;
  if (losses >= 3) return finish(g, 'evil', 'Fracasaron 3 misiones');
  if (wins >= 3) {
    g.phase = 'assassin';
    return;
  }
  g.questIdx++;
  nextLeader(g);
}

function assassinate(g, by, target) {
  if (g.phase !== 'assassin') throw new Error('No es momento del asesinato');
  if (g.roleOf[by] !== 'assassin') throw new Error('Sólo el Asesino elige');
  if (!g.order.includes(target) || teamOf(g, target) !== 'good') throw new Error('Elegí un jugador del bien');
  g.assassinTarget = target;
  if (g.roleOf[target] === 'merlin') finish(g, 'evil', 'El Asesino encontró a Merlín');
  else finish(g, 'good', 'Tres misiones exitosas y Merlín sobrevivió');
}

function nextLeader(g) {
  g.leaderIdx = (g.leaderIdx + 1) % g.order.length;
  g.team = [];
  g.votes = {};
  g.phase = 'team';
}

function finish(g, winner, reason) {
  g.phase = 'end';
  g.winner = winner;
  g.winReason = reason;
}

// Vista filtrada para un jugador: nunca filtra roles ajenos salvo al final.
function viewFor(g, id) {
  const inGame = g.order.includes(id);
  const role = inGame ? g.roleOf[id] : null;
  return {
    phase: g.phase,
    order: g.order,
    leader: leaderId(g),
    questIdx: g.questIdx,
    questSizes: QUEST_SIZES[g.order.length],
    failsNeeded: QUEST_SIZES[g.order.length].map((_, i) => failsNeeded(g.order.length, i)),
    rejections: g.rejections,
    results: g.results,
    team: g.team,
    votedIds: Object.keys(g.votes),
    myVote: id in g.votes ? g.votes[id] : null,
    playedIds: Object.keys(g.questCards),
    myCardPlayed: id in g.questCards,
    lastVote: g.lastVote,
    winner: g.winner,
    winReason: g.winReason,
    assassinTarget: g.assassinTarget,
    assassin: g.phase === 'assassin' || g.phase === 'end' ? g.order.find((p) => g.roleOf[p] === 'assassin') : null,
    me: inGame
      ? { role, roleName: ROLES[role].name, team: ROLES[role].team, night: nightInfo(g, id) }
      : null,
    roles: g.phase === 'end' ? g.roleOf : null,
    rolesInPlay: Object.values(g.roleOf).reduce((acc, r) => ((acc[r] = (acc[r] || 0) + 1), acc), {}),
  };
}

module.exports = {
  QUEST_SIZES, EVIL_COUNT, ROLES, MIN_PLAYERS, MAX_PLAYERS,
  startGame, proposeTeam, castVote, playQuestCard, assassinate, viewFor, buildRoleList,
};
