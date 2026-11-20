// Almacén de salas. En Vercel usa Upstash Redis; en local (sin variables) usa memoria.
// Cada sala se guarda como hash { data: JSON, ver: n } y se escribe con compare-and-set,
// así dos jugadores que votan a la vez no se pisan.

const TTL_SECONDS = 24 * 60 * 60;
const key = (code) => `avalon:room:${code}`;

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
  };
}

function memoryStore() {
  const rooms = new Map();
  return {
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

const hasRedis = !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
module.exports = hasRedis ? redisStore() : memoryStore();
module.exports.kind = hasRedis ? 'redis' : 'memory';
