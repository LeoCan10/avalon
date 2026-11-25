# Avalon

Versión web de *The Resistance: Avalon* para jugar en persona con amigos: cada uno usa su celular y la charla es en voz alta.

- Salas con código de 4 letras, de 5 a 10 jugadores.
- Personajes: Merlín, Asesino, Percival, Morgana, Mordred y Oberón.
- Reglas oficiales: tamaños de equipo según jugadores, 2 fracasos en la 4ª misión con 7+, 5 rechazos seguidos gana el mal, asesinato de Merlín.

## Correr local

```bash
npm install
npm start      # http://localhost:3000 (salas en memoria)
npm test       # simula partidas completas
```

## Deploy

Vercel con una base Redis: sirve `REDIS_URL` (conexión TCP) o la API REST de Upstash (`UPSTASH_REDIS_REST_URL`/`TOKEN` o `KV_REST_API_URL`/`TOKEN`). Las salas expiran a las 24 h.
