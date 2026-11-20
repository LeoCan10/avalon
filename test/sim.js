// Simula partidas completas con bots contra el servidor real por HTTP.
// Uso: npm test (levanta dev.js en el puerto 3999) o BASE_URL=https://... npm test
const { spawn } = require('child_process');
const assert = require('assert');

const PORT = 3999;
const BASE = process.env.BASE_URL || `http://localhost:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(body) {
  const r = await fetch(BASE + '/api/room', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
async function view(code, token) {
  const r = await fetch(`${BASE}/api/room?code=${code}&token=${token}`);
  return r.json();
}

async function playGame(n, strategy) {
  const tokens = [];
  const c = await call({ action: 'create', name: 'Bot0' });
  const code = c.state.code;
  tokens.push(c.token);
  // Todos se unen a la vez: prueba que el compare-and-set no pierde jugadores
  const joins = await Promise.all(Array.from({ length: n - 1 }, (_, i) => call({ action: 'join', code, name: 'Bot' + (i + 1) })));
  joins.forEach((j) => tokens.push(j.token));
  assert.strictEqual((await view(code, tokens[0])).players.length, n, 'se perdieron jugadores al unirse en paralelo');

  await call({ action: 'setOptions', code, token: tokens[0], options: { percival: true, morgana: true, mordred: n >= 7, oberon: n >= 10 } });
  await call({ action: 'start', code, token: tokens[0] });

  let states = await Promise.all(tokens.map((t) => view(code, t)));
  for (const s of states) assert.strictEqual(s.game.roles, null, 'roles filtrados');
  const byId = Object.fromEntries(states.map((s, i) => [s.meId, i]));

  for (let step = 0; step < 100; step++) {
    states = await Promise.all(tokens.map((t) => view(code, t)));
    const g = states[0].game;
    if (g.phase === 'end') return { g, code };
    const act = (i, body) => call({ code, token: tokens[i], ...body });
    if (g.phase === 'team') {
      await act(byId[g.leader], { action: 'propose', team: g.order.slice(0, g.questSizes[g.questIdx]) });
    } else if (g.phase === 'vote') {
      // Votan todos en paralelo: prueba de concurrencia
      await Promise.all(states.map((s, i) => act(i, { action: 'vote', approve: strategy.vote })));
    } else if (g.phase === 'quest') {
      await Promise.all(g.team.map((id) => act(byId[id], { action: 'questCard', success: states[byId[id]].game.me.team === 'good' ? true : strategy.evilCard })));
    } else if (g.phase === 'assassin') {
      const ai = states.findIndex((s) => s.game.me.role === 'assassin');
      const target = states.find((s) => s.game.me.team === 'good' && (s.game.me.role === 'merlin') === !!strategy.findMerlin).meId;
      await act(ai, { action: 'assassinate', target });
    }
  }
  throw new Error('La partida no terminó');
}

(async () => {
  const srv = process.env.BASE_URL ? null : spawn('node', ['dev.js'], { env: { ...process.env, PORT, UPSTASH_REDIS_REST_URL: '', KV_REST_API_URL: '' }, stdio: 'ignore' });
  if (srv) await sleep(700);
  try {
    let r = await playGame(5, { vote: true, evilCard: false });
    assert.strictEqual(r.g.winner, 'evil'); assert.match(r.g.winReason, /3 misiones/);
    console.log('✓ 5 jugadores, el mal sabotea todo → gana el mal');

    r = await playGame(7, { vote: true, evilCard: true, findMerlin: false });
    assert.strictEqual(r.g.winner, 'good');
    console.log('✓ 7 jugadores, misiones exitosas y el Asesino falla → gana el bien');

    r = await playGame(8, { vote: true, evilCard: true, findMerlin: true });
    assert.strictEqual(r.g.winner, 'evil'); assert.match(r.g.winReason, /Merlín/);
    console.log('✓ 8 jugadores, el Asesino encuentra a Merlín → gana el mal');

    r = await playGame(10, { vote: false, evilCard: true });
    assert.strictEqual(r.g.winner, 'evil'); assert.match(r.g.winReason, /5 equipos/);
    assert.ok(r.g.roles, 'roles revelados al final');
    console.log('✓ 10 jugadores, 5 rechazos seguidos → gana el mal');

    await assert.rejects(call({ action: 'join', code: r.code, name: 'Tarde' }), /ya empezó/);
    const bad = await fetch(`${BASE}/api/room?code=${r.code}&token=falso`);
    assert.strictEqual(bad.status, 410);
    console.log('✓ no se puede entrar a una partida empezada ni espiar sin token');
    console.log('Todo OK');
  } catch (e) {
    console.error('FALLÓ:', e.message);
    process.exitCode = 1;
  } finally {
    if (srv) srv.kill();
  }
})();
