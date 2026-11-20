// Servidor local: mismo handler que en Vercel, salas en memoria (o en Redis si hay variables).
const express = require('express');
const os = require('os');
const handler = require('./api/room');
const store = require('./lib/store');

const app = express();
app.use(express.json());
app.all('/api/room', handler);
app.use(express.static(__dirname + '/public'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`Avalon (${store.kind}) en http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  En la misma WiFi: http://${ip}:${PORT}`);
});
