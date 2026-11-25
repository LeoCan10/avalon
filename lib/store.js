// Almacén de salas. En Vercel usa Upstash Redis; en local (sin variables) usa memoria.
// Cada sala se guarda como hash { data: JSON, ver: n } y se escribe con compare-and-set,
// así dos jugadores que votan a la vez no se pisan.

const TTL_SECONDS = 24 * 60 * 60;
const key = (code) => `avalon:room:${code}`;
// Presencia: cuándo consultó cada jugador por última vez (hash aparte, no toca la versión de la sala)
const seenKey = (code) => `avalon:seen:${code}`;
const toSeen = (h) => Object.fromEntries(Object.entries(h || {}).map(([k, v]) => [k, Number(v)]));

const CAS_SCRIPT = `
local cur = redis.call('HGET', KEYS[1], 'ver')
if (cur == false and ARGV[1] == '0') or cur == ARGV[1] then
  redis.call('HSET', KEYS[1], 'data', ARGV[3], 'ver', ARGV[2])
  redis.call('EXPIRE', KEYS[1], ARGV[4])
  return 1
end
return 0`;

function redisStore() {
  const { Redis } = require('@upstash/redis');
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  const redis = new Redis({ url, token, automaticDeserialization: false });
  return {
    async get(code) {
      const h = await redis.hgetall(key(code));
      if (!h || !h.data) return null;
      return { room: JSON.parse(h.data), ver: Number(h.ver) };
    },
    async cas(code, prevVer, room) {
      const ok = await redis.eval(CAS_SCRIPT, [key(code)], [String(prevVer), String(prevVer + 1), JSON.stringify(room), String(TTL_SECONDS)]);
      return Number(ok) === 1;
    },
    async touch(code, id) {
      const [, , h] = await redis.pipeline().hset(seenKey(code), { [id]: String(Date.now()) }).expire(seenKey(code), TTL_SECONDS).hgetall(seenKey(code)).exec();
      return toSeen(h);
    },
    async seen(code) {
      return toSeen(await redis.hgetall(seenKey(code)));
    },
  };
}

// Redis por TCP (variable REDIS_URL). La conexión se reutiliza entre invocaciones "tibias".
function tcpRedisStore() {
  const { createClient } = require('redis');
  let clientPromise = null;
  const client = () => {
    if (!clientPromise) {
      const c = createClient({ url: process.env.REDIS_URL });
      c.on('error', (e) => console.error('redis', e.message));
      clientPromise = c.connect().then(() => c).catch((e) => { clientPromise = null; throw e; });
    }
    return clientPromise;
  };
  return {
    async get(code) {
      const h = await (await client()).hGetAll(key(code));
      if (!h || !h.data) return null;
      return { room: JSON.parse(h.data), ver: Number(h.ver) };
    },
    async cas(code, prevVer, room) {
      const ok = await (await client()).eval(CAS_SCRIPT, {
        keys: [key(code)],
        arguments: [String(prevVer), String(prevVer + 1), JSON.stringify(room), String(TTL_SECONDS)],
      });
      return Number(ok) === 1;
    },
    async touch(code, id) {
      const res = await (await client()).multi().hSet(seenKey(code), id, String(Date.now())).expire(seenKey(code), TTL_SECONDS).hGetAll(seenKey(code)).exec();
      return toSeen(res[2]);
    },
    async seen(code) {
      return toSeen(await (await client()).hGetAll(seenKey(code)));
    },
  };
}

function memoryStore() {
  const rooms = new Map();
  const seenMap = new Map();
  return {
    async touch(code, id) {
      const m = seenMap.get(code) || {};
      m[id] = Date.now(); seenMap.set(code, m);
      return { ...m };
    },
    async seen(code) {
      return { ...(seenMap.get(code) || {}) };
    },
    async get(code) {
      const r = rooms.get(code);
      return r ? { room: JSON.parse(r.data), ver: r.ver } : null;
    },
    async cas(code, prevVer, room) {
      const cur = rooms.get(code);
      if ((cur ? cur.ver : 0) !== prevVer) return false;
      rooms.set(code, { data: JSON.stringify(room), ver: prevVer + 1 });
      return true;
    },
  };
}

const hasRest = !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
const hasTcp = !!process.env.REDIS_URL;
module.exports = hasRest ? redisStore() : hasTcp ? tcpRedisStore() : memoryStore();
module.exports.kind = hasRest ? 'redis-rest' : hasTcp ? 'redis-tcp' : 'memory';
