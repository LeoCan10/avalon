// Ilustraciones de cartas en SVG, dibujadas a mano. Sin imágenes externas.
(function () {
  const GOLD = '#e7c36a';
  const GOLD_D = '#9c7330';

  const PALETTE = {
    merlin:   { a: '#2b2f7a', b: '#0b0d2e', glow: '#9fb4ff' },
    percival: { a: '#1f4f86', b: '#0a1a33', glow: '#bcd8ff' },
    servant:  { a: '#24507e', b: '#0c1c30', glow: '#e7c36a' },
    assassin: { a: '#6b1515', b: '#1c0505', glow: '#ff6a4a' },
    morgana:  { a: '#4b1d6b', b: '#14061f', glow: '#d58cff' },
    mordred:  { a: '#3a0d0d', b: '#0a0202', glow: '#ff3b3b' },
    oberon:   { a: '#20403a', b: '#060f0d', glow: '#7dffcf' },
    minion:   { a: '#5a1a12', b: '#180604', glow: '#ff8a3a' },
    back:     { a: '#1d2b52', b: '#0a1024', glow: '#e7c36a' },
  };

  let uid = 0;
  const sparkle = (x, y, r, fill = GOLD, cls = 'tw') =>
    `<path class="${cls}" style="animation-delay:${(Math.random() * 3).toFixed(2)}s" d="M${x} ${y - r}L${x + r * 0.25} ${y - r * 0.25}L${x + r} ${y}L${x + r * 0.25} ${y + r * 0.25}L${x} ${y + r}L${x - r * 0.25} ${y + r * 0.25}L${x - r} ${y}L${x - r * 0.25} ${y - r * 0.25}Z" fill="${fill}"/>`;

  const EMBLEM = {
    merlin: () => `
      <circle cx="100" cy="112" r="62" fill="url(#halo)"/>
      <path d="M150 58a26 26 0 1 1-30-22a20 20 0 1 0 30 22z" fill="${GOLD}" opacity=".9"/>
      <path d="M100 40C104 62 120 112 142 150H58C80 112 92 70 100 40Z" fill="#2a2b78" stroke="${GOLD}" stroke-width="2.5"/>
      <path d="M100 40C96 52 90 60 80 64" fill="none" stroke="${GOLD}" stroke-width="2"/>
      <ellipse cx="100" cy="151" rx="58" ry="10" fill="#1d1e5a" stroke="${GOLD}" stroke-width="2.5"/>
      ${sparkle(96, 98, 7)}${sparkle(114, 124, 5)}${sparkle(84, 132, 4)}${sparkle(104, 74, 4)}
      ${sparkle(46, 70, 4)}${sparkle(160, 120, 5)}${sparkle(38, 130, 3)}
      <path d="M100 160v40" stroke="${GOLD_D}" stroke-width="5" stroke-linecap="round"/>`,

    percival: () => `
      <circle cx="100" cy="112" r="62" fill="url(#halo)"/>
      <path d="M40 196L160 40" stroke="#c9b48a" stroke-width="5" stroke-linecap="round"/>
      <path d="M160 40l-14 4 9 9z" fill="#ddd"/>
      <path d="M100 56L142 70L138 118C133 150 114 170 100 182C86 170 67 150 62 118L58 70Z" fill="#2c64a8" stroke="${GOLD}" stroke-width="3"/>
      <path d="M100 66v104M70 104h60" stroke="${GOLD}" stroke-width="7"/>
      <path d="M100 56L142 70L138 118C133 150 114 170 100 182" fill="none" stroke="#ffffff33" stroke-width="2"/>`,

    servant: () => `
      <circle cx="100" cy="112" r="62" fill="url(#halo)"/>
      <path d="M70 62l8-22 11 14 11-18 11 18 11-14 8 22z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="1.5"/>
      <circle cx="100" cy="46" r="3" fill="#c0392b"/>
      <path d="M95 76h10v92l-5 14-5-14z" fill="#d9dde3" stroke="#8a93a0" stroke-width="1.5"/>
      <path d="M100 78v100" stroke="#ffffff88" stroke-width="1"/>
      <rect x="72" y="166" width="56" height="8" rx="3" fill="${GOLD}" stroke="${GOLD_D}"/>
      <rect x="96" y="174" width="8" height="18" fill="#5b3a1e"/>
      <circle cx="100" cy="196" r="6" fill="${GOLD}" stroke="${GOLD_D}"/>`,

    assassin: () => `
      <circle cx="100" cy="112" r="62" fill="url(#halo)"/>
      <g transform="rotate(-38 100 112)">
        <path d="M95 40h10l3 92h-16z" fill="#cfd3d8" stroke="#6b7078" stroke-width="1.5"/>
        <path d="M95 40l5-14 5 14z" fill="#cfd3d8"/>
        <path d="M100 30v100" stroke="#ffffff99" stroke-width="1"/>
        <path d="M74 132h52l-6 8h-40z" fill="#2a2a2a" stroke="${GOLD_D}" stroke-width="2"/>
        <rect x="95" y="140" width="10" height="30" fill="#3b1d12"/>
        <circle cx="100" cy="176" r="7" fill="#8b1e1e" stroke="${GOLD_D}" stroke-width="2"/>
      </g>
      <path d="M128 156c0 8-7 12-7 12s-7-4-7-12 7-14 7-14 7 6 7 14z" fill="#b3141b"/>
      <path d="M146 176c0 5-4 8-4 8s-4-3-4-8 4-9 4-9 4 4 4 9z" fill="#b3141b"/>`,

    morgana: () => `
      <circle cx="100" cy="112" r="62" fill="url(#halo)"/>
      <path d="M124 52A60 60 0 1 0 124 172A48 48 0 1 1 124 52Z" fill="#c9a6ff" stroke="${GOLD}" stroke-width="2"/>
      <path d="M78 112c10-12 34-12 44 0c-10 12-34 12-44 0z" fill="#1a0826" stroke="#d58cff" stroke-width="2"/>
      <circle cx="100" cy="112" r="7" fill="#d58cff"/>
      <circle cx="100" cy="112" r="3" fill="#000"/>
      ${sparkle(150, 70, 5, '#e9c8ff')}${sparkle(160, 150, 4, '#e9c8ff')}${sparkle(48, 60, 3, '#e9c8ff')}
      <path class="mist" d="M30 190c20-10 40 6 60-2s40-10 60 0 20 4 30 0" fill="none" stroke="#d58cff55" stroke-width="6" stroke-linecap="round"/>`,

    mordred: () => `
      <circle cx="100" cy="112" r="62" fill="url(#halo)"/>
      <path d="M48 160V88l24 26 14-48 14 38 14-38 14 48 24-26v72z" fill="#141010" stroke="#b3141b" stroke-width="3" stroke-linejoin="round"/>
      <rect x="44" y="156" width="112" height="16" rx="3" fill="#1d1414" stroke="#b3141b" stroke-width="3"/>
      <circle cx="100" cy="130" r="10" fill="#d11a1a" stroke="#ff8a8a" stroke-width="1.5"/>
      <circle cx="96" cy="126" r="3" fill="#ffb3b3"/>
      <circle cx="72" cy="164" r="3" fill="#d11a1a"/><circle cx="128" cy="164" r="3" fill="#d11a1a"/>`,

    oberon: () => `
      <circle cx="100" cy="112" r="62" fill="url(#halo)"/>
      <path d="M100 48C60 52 48 120 52 190H148C152 120 140 52 100 48Z" fill="#0f1f1c" stroke="#3d7a6c" stroke-width="2.5"/>
      <path d="M100 66C76 70 70 110 74 140C84 150 116 150 126 140C130 110 124 70 100 66Z" fill="#000"/>
      <ellipse class="eye" cx="100" cy="108" rx="9" ry="5" fill="#7dffcf"/>
      <circle cx="100" cy="108" r="2.5" fill="#000"/>`,

    minion: () => `
      <circle cx="100" cy="112" r="62" fill="url(#halo)"/>
      <path d="M62 100C40 92 34 66 42 50C48 72 60 82 72 84z" fill="#d8cbb0" stroke="#7a6a50" stroke-width="2"/>
      <path d="M138 100C160 92 166 66 158 50C152 72 140 82 128 84z" fill="#d8cbb0" stroke="#7a6a50" stroke-width="2"/>
      <path d="M60 170V112C60 82 78 66 100 66S140 82 140 112V170Z" fill="#4a4a4a" stroke="${GOLD_D}" stroke-width="3"/>
      <path d="M70 116h60v10H106v38h-12V126H70z" fill="#0b0b0b"/>
      <ellipse cx="84" cy="121" rx="6" ry="2.5" fill="#ff8a3a"/><ellipse cx="116" cy="121" rx="6" ry="2.5" fill="#ff8a3a"/>
      <path d="M100 66v46" stroke="#ffffff22" stroke-width="3"/>`,

    back: () => `
      <circle cx="100" cy="112" r="64" fill="none" stroke="${GOLD}" stroke-width="2"/>
      <circle cx="100" cy="112" r="56" fill="none" stroke="${GOLD}55" stroke-width="1"/>
      <path d="M100 52v104" stroke="#d9dde3" stroke-width="6"/>
      <path d="M100 48l-3 6h6z" fill="#d9dde3"/>
      <rect x="80" y="140" width="40" height="6" rx="2" fill="${GOLD}"/>
      <rect x="97" y="146" width="6" height="14" fill="#5b3a1e"/>
      <path d="M62 168h76l-8-14H70z" fill="#5a5f6a" stroke="#2b2f38"/>
      ${sparkle(100, 46, 6)}`,
  };

  const NAMES = { merlin: 'Merlín', percival: 'Percival', servant: 'Leal Servidor', assassin: 'Asesino', morgana: 'Morgana', mordred: 'Mordred', oberon: 'Oberón', minion: 'Esbirro', back: 'Avalon' };

  // Carta completa (200x280)
  function card(role) {
    const p = PALETTE[role] || PALETTE.back;
    const id = 'c' + uid++;
    const lattice = role === 'back'
      ? `<pattern id="${id}l" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="16" height="16" fill="none" stroke="${GOLD}22" stroke-width="1"/></pattern><rect x="12" y="12" width="176" height="256" rx="8" fill="url(#${id}l)"/>`
      : '';
    return `<svg viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg" class="card-svg">
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.a}"/><stop offset="1" stop-color="${p.b}"/></linearGradient>
        <radialGradient id="${id}h"><stop offset="0" stop-color="${p.glow}" stop-opacity=".45"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
      </defs>
      <rect x="2" y="2" width="196" height="276" rx="14" fill="url(#${id}g)" stroke="${GOLD_D}" stroke-width="3"/>
      ${lattice}
      <rect x="10" y="10" width="180" height="260" rx="9" fill="none" stroke="${GOLD}" stroke-width="1.5"/>
      <rect x="15" y="15" width="170" height="250" rx="6" fill="none" stroke="${GOLD}55" stroke-width="1"/>
      ${[[18, 18], [182, 18], [18, 262], [182, 262]].map(([x, y]) => `<path d="M${x} ${y - 6}L${x + 6} ${y}L${x} ${y + 6}L${x - 6} ${y}Z" fill="${GOLD}"/>`).join('')}
      <path d="M40 24Q100 6 160 24" fill="none" stroke="${GOLD}88" stroke-width="1.5"/>
      ${EMBLEM[role] ? EMBLEM[role]().replaceAll('url(#halo)', `url(#${id}h)`) : ''}
      <path d="M26 218h148l-8 12 8 12H26l8-12z" fill="#f1e3c0" stroke="${GOLD_D}" stroke-width="2"/>
      <text x="100" y="236" text-anchor="middle" font-family="Cinzel, serif" font-weight="800" font-size="${(NAMES[role] || '').length > 10 ? 14 : 17}" fill="#3a2410" letter-spacing="${(NAMES[role] || '').length > 10 ? 0 : 1}">${NAMES[role] || ''}</text>
    </svg>`;
  }

  // Cartas de misión
  function questCard(success) {
    const id = 'q' + uid++;
    const bg = success ? ['#f3e6c4', '#d7bf86'] : ['#4a0f0f', '#150404'];
    const emblem = success
      ? `<path d="M64 70h72c0 40-16 62-36 66c-20-4-36-26-36-66z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="3"/>
         <path d="M92 136h16v34h-16z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2"/>
         <path d="M70 176h60l-6-8H76z" fill="${GOLD}" stroke="${GOLD_D}" stroke-width="2"/>
         <circle cx="100" cy="96" r="7" fill="#b3141b"/><circle cx="82" cy="88" r="4" fill="#2c64a8"/><circle cx="118" cy="88" r="4" fill="#2c64a8"/>
         ${sparkle(100, 50, 8, '#fff6d8')}${sparkle(60, 56, 4, '#fff6d8')}${sparkle(142, 60, 5, '#fff6d8')}`
      : `<path d="M64 70h72c0 40-16 62-36 66c-20-4-36-26-36-66z" fill="#1b1b1b" stroke="#b3141b" stroke-width="3"/>
         <path d="M96 70l10 18-12 12 10 18-6 18" fill="none" stroke="#ff4a3a" stroke-width="3"/>
         <path d="M92 136h16v34h-16z" fill="#1b1b1b" stroke="#b3141b" stroke-width="2"/>
         <path d="M70 176h60l-6-8H76z" fill="#1b1b1b" stroke="#b3141b" stroke-width="2"/>
         <path d="M128 150c0 7-6 11-6 11s-6-4-6-11 6-12 6-12 6 5 6 12z" fill="#d11a1a"/>`;
    const ink = success ? '#3a2410' : '#f1e3c0';
    return `<svg viewBox="0 0 200 280" class="card-svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
      <rect x="2" y="2" width="196" height="276" rx="14" fill="url(#${id})" stroke="${GOLD_D}" stroke-width="3"/>
      <rect x="10" y="10" width="180" height="260" rx="9" fill="none" stroke="${success ? GOLD_D : '#b3141b'}" stroke-width="1.5"/>
      ${emblem}
      <text x="100" y="236" text-anchor="middle" font-family="Cinzel, serif" font-weight="800" font-size="24" fill="${ink}" letter-spacing="2">${success ? 'ÉXITO' : 'FRACASO'}</text></svg>`;
  }

  // Sello de cera para votos
  function seal(approve) {
    const c = approve ? ['#3f7fd0', '#1b3d6e'] : ['#c0392b', '#5e1410'];
    const id = 's' + uid++;
    const mark = approve
      ? `<path d="M34 52l12 12 22-26" fill="none" stroke="#f6e7bd" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
      : `<path d="M36 36l28 28M64 36L36 64" stroke="#f6e7bd" stroke-width="7" stroke-linecap="round"/>`;
    return `<svg viewBox="0 0 100 100" class="seal-svg"><defs><radialGradient id="${id}" cx=".35" cy=".3"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></radialGradient></defs>
      <path d="M50 4C62 2 70 10 80 12s16 14 16 26-6 18-4 28-8 22-20 26-18 6-28 4S24 88 16 80 4 64 6 50s-2-24 6-34S38 6 50 4z" fill="url(#${id})"/>
      <circle cx="50" cy="50" r="32" fill="none" stroke="#00000033" stroke-width="3"/>${mark}</svg>`;
  }

  // Íconos chicos
  const icon = {
    crown: `<svg viewBox="0 0 24 24" class="ico"><path d="M3 18L2 7l5 4 5-7 5 7 5-4-1 11z" fill="${GOLD}" stroke="${GOLD_D}"/></svg>`,
    sword: `<svg viewBox="0 0 24 24" class="ico"><path d="M20.5 2.5L21.5 3.5L12 13L11 12Z" fill="#dfe3e8" stroke="#6b7078" stroke-width=".8"/><path d="M8.5 10.5L13.5 15.5" stroke="#b8862b" stroke-width="2.4" stroke-linecap="round"/><path d="M10.5 13.5L6.5 17.5" stroke="#5b3a1e" stroke-width="2.2" stroke-linecap="round"/><circle cx="5.5" cy="18.5" r="1.8" fill="#b8862b"/></svg>`,
    quill: `<svg viewBox="0 0 24 24" class="ico"><path d="M20 2C10 4 6 10 4 20l2 1c2-6 6-10 10-12-3 0-5 1-7 2 3-4 7-7 11-9z" fill="#3a2410"/></svg>`,
  };

  // Castillo para la portada
  const castle = `<svg viewBox="0 0 400 180" class="castle" preserveAspectRatio="xMidYMax meet">
    <circle cx="300" cy="50" r="26" fill="#f4e7c2" opacity=".9"/>
    ${Array.from({ length: 18 }, () => sparkle(Math.random() * 400, Math.random() * 90, 1.5 + Math.random() * 2, '#f4e7c2')).join('')}
    <path d="M0 180V150l40-10 30 8 40-14 60 10 50-12 60 12 50-8 70 10V180z" fill="#120e0c"/>
    <g fill="#1d1714" stroke="#2c231d">
      <path d="M120 180V96h-8V80h12v8h8v-8h12v8h8v-8h12v16h-8v84z"/>
      <path d="M232 180V96h-8V80h12v8h8v-8h12v8h8v-8h12v16h-8v84z"/>
      <path d="M150 180V120h100V180z"/>
      <path d="M174 70h52v110h-52z"/>
      <path d="M168 70l32-36 32 36z" fill="#2a1e18"/>
      <path d="M126 80l18-22 18 22z" fill="#2a1e18"/><path d="M238 80l18-22 18 22z" fill="#2a1e18"/>
    </g>
    <path d="M190 180v-26a10 10 0 0 1 20 0v26z" fill="#0a0706"/>
    <rect x="195" y="96" width="10" height="16" rx="5" fill="#e7a93c" class="flicker"/>
    <rect x="138" y="108" width="6" height="10" rx="3" fill="#e7a93c" class="flicker"/>
    <rect x="250" y="112" width="6" height="10" rx="3" fill="#e7a93c" class="flicker" style="animation-delay:.7s"/>
    <path d="M200 34v-18l14 5-14 5" fill="#8b1e1e" class="flag"/>
  </svg>`;

  // Escudo heráldico con la inicial del jugador
  const HERALD = ['#8b1e1e', '#1f4f86', '#2f6b3a', '#6b4a1d', '#4b1d6b', '#7a5b12', '#1d5f63', '#5a2a4a', '#3a3f8a', '#7a2f12'];
  function shield(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const c = HERALD[h % HERALD.length];
    const split = h % 3;
    const ch = (name.trim()[0] || '?').toUpperCase().replace(/[<>&"]/g, '');
    const deco = split === 0 ? `<path d="M2 2h10v26C6 24 2 18 2 12z" fill="#00000030"/>` : split === 1 ? `<path d="M2 2h20v8H2z" fill="#ffffff20"/>` : '';
    return `<svg viewBox="0 0 24 30" class="shield"><path d="M2 2h20v10c0 8-5 13-10 16C7 25 2 20 2 12z" fill="${c}" stroke="${GOLD}" stroke-width="1.2"/>${deco}<text x="12" y="17" text-anchor="middle" font-family="Cinzel, serif" font-weight="800" font-size="11" fill="#f6e7bd">${ch}</text></svg>`;
  }

  window.ART = { card, questCard, seal, icon, castle, shield, PALETTE };
})();
