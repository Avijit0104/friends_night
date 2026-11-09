/* Friend's Night — hub page logic.
 * Reads games.json, draws the cards, checks (and wakes) each game server, and launches games. */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  // On our own server every game has its own subdomain (vault.<domain>) and a same-origin status check
  // (/status/<id>). Anywhere else (local preview, GitHub Pages) we fall back to each game's backupUrl.
  const host = location.hostname;
  const onOwnServer = location.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/.test(host) && !host.endsWith('.github.io');

  const gameUrl = (g) => (onOwnServer && g.subdomain ? `https://${g.subdomain}.${host}/` : g.backupUrl);

  let games = [];
  const status = {}; // id -> 'checking' | 'online' | 'waking' | 'offline'
  let humans = Number(store.get('fn_humans')) || 0; // 0 = any

  /* ---------------- scenery ---------------- */
  function buildSky() {
    // stars
    const stars = $('#stars');
    const n = innerWidth < 600 ? 55 : 110;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.className = 'star' + (Math.random() < 0.12 ? ' big' : '');
      s.style.left = Math.random() * 100 + '%';
      s.style.top = Math.random() * 75 + '%';
      s.style.setProperty('--d', (2.5 + Math.random() * 4).toFixed(1) + 's');
      s.style.setProperty('--delay', (-Math.random() * 6).toFixed(1) + 's');
      frag.appendChild(s);
    }
    stars.appendChild(frag);

    // fairy-light bulbs along the wire, switched on one after another
    const svg = $('#lights');
    const path = svg.querySelector('.wire');
    const bulbs = document.createElement('div');
    bulbs.className = 'bulbs';
    const colors = ['#ffcf6e', '#ff7a9c', '#7fd6ff', '#9dff8a', '#ffa45c', '#d59bff'];
    const count = innerWidth < 600 ? 13 : 24;
    const len = path.getTotalLength();
    for (let i = 1; i < count; i++) {
      const p = path.getPointAtLength((len * i) / count);
      const b = document.createElement('i');
      b.className = 'bulb';
      b.style.left = (p.x / 1200) * 100 + '%';
      b.style.top = (p.y / 140) * 120 + 'px';
      b.style.setProperty('--c', colors[i % colors.length]);
      b.style.setProperty('--on', (0.15 + i * 0.05).toFixed(2) + 's');
      bulbs.appendChild(b);
    }
    svg.after(bulbs);

    // floating lanterns
    if (!reduceMotion) {
      const box = $('#lanterns');
      const m = innerWidth < 600 ? 4 : 7;
      for (let i = 0; i < m; i++) {
        const l = document.createElement('i');
        l.className = 'lantern';
        l.style.left = 5 + Math.random() * 90 + '%';
        l.style.setProperty('--t', 20 + Math.random() * 16 + 's');
        l.style.setProperty('--delay', -Math.random() * 30 + 's');
        l.style.setProperty('--s', (0.55 + Math.random() * 0.6).toFixed(2));
        l.style.setProperty('--drift', (Math.random() * 80 - 40).toFixed(0) + 'px');
        box.appendChild(l);
      }
    }
  }

  /* ---------------- player-count chips ---------------- */
  function buildChips() {
    const max = Math.max(6, ...games.map((g) => g.humans[1]));
    const box = $('#chips');
    const opts = [[0, 'Any']].concat(Array.from({ length: max }, (_, i) => [i + 1, String(i + 1)]));
    box.innerHTML = opts.map(([v, label]) =>
      `<button class="chip" type="button" role="radio" data-n="${v}" aria-checked="${v === humans}" aria-label="${v ? v + ' player' + (v > 1 ? 's' : '') : 'Any number of players'}">${label}</button>`
    ).join('');
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      humans = Number(b.dataset.n);
      store.set('fn_humans', humans);
      box.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-checked', String(c === b)));
      applyFilter();
    });
    // arrow keys move between chips (radiogroup pattern)
    box.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      const all = [...box.querySelectorAll('.chip')];
      const i = all.indexOf(document.activeElement);
      const next = all[(i + (e.key === 'ArrowRight' ? 1 : -1) + all.length) % all.length];
      next.focus(); next.click();
    });
  }

  function fits(g) { return !humans || (humans >= g.humans[0] && humans <= g.humans[1]); }

  function applyFilter() {
    games.forEach((g) => {
      const card = document.getElementById('card-' + g.id);
      if (!card) return;
      const ok = fits(g);
      card.classList.toggle('dim', !ok);
      $('.fit', card).hidden = ok;
    });
  }

  /* ---------------- cards ---------------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const statusText = { checking: 'Checking…', online: 'Ready to play', waking: 'Waking up…', offline: 'Offline right now' };

  function cardHTML(g, i) {
    return `
    <article class="card" id="card-${esc(g.id)}" style="--accent:${esc(g.accent)};--bg1:${esc(g.bg[0])};--bg2:${esc(g.bg[1])};--in:${(1.3 + i * 0.12).toFixed(2)}s">
      <div class="card-top">
        <div class="card-icon" style="--bob:${-i * 0.7}s"><img src="${esc(g.icon)}" alt="" width="72" height="72" /></div>
        <h2 class="card-name">${esc(g.name)}${g.short ? `<small>${esc(g.short)}</small>` : ''}</h2>
      </div>
      <p class="card-tag">${esc(g.tagline)}</p>
      <div class="meta">
        <span>👥 ${esc(g.seats)}</span>
        <span>⏱ ${esc(g.time)}</span>
        ${g.tags.map((t) => `<span>${esc(t)}</span>`).join('')}
        <span class="warn fit" hidden>Up to ${g.humans[1]} people</span>
      </div>
      <div class="card-foot">
        <span class="status" data-s="checking"><i></i><span>${statusText.checking}</span></span>
        <button class="btn ghost" type="button" data-info="${esc(g.id)}" aria-label="How to play ${esc(g.name)}">ⓘ</button>
        <a class="btn primary play" href="${esc(gameUrl(g))}" data-play="${esc(g.id)}">Play <span class="arrow">→</span></a>
      </div>
    </article>`;
  }

  function soonHTML(i) {
    return `
    <article class="card soon" style="--in:${(1.3 + i * 0.12).toFixed(2)}s">
      <div class="steam" aria-hidden="true"><i></i><i></i><i></i></div>
      <div class="cup" aria-hidden="true">🍵</div>
      <h3>Next game is brewing…</h3>
      <p>More games are on the way. Check back soon!</p>
    </article>`;
  }

  function renderCards() {
    const grid = $('#grid');
    grid.innerHTML = games.map(cardHTML).join('') + soonHTML(games.length);
    applyFilter();
    // once a card has faded in, drop the entrance animation so later changes can't replay it
    grid.addEventListener('animationend', (e) => {
      if (e.animationName === 'card-in') e.target.classList.add('shown');
    });
    if (!reduceMotion && matchMedia('(hover: hover) and (pointer: fine)').matches) enableTilt(grid);

    grid.addEventListener('click', (e) => {
      const info = e.target.closest('[data-info]');
      if (info) return openGame(info.dataset.info, info);
      const play = e.target.closest('[data-play]');
      if (play && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
        e.preventDefault();
        launch(play.dataset.play, play);
      }
    });
  }

  function enableTilt(grid) {
    grid.addEventListener('pointermove', (e) => {
      const card = e.target.closest('.card:not(.soon):not(.dim)'); if (!card) return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg');
      card.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg');
    });
    grid.addEventListener('pointerout', (e) => {
      const card = e.target.closest('.card');
      if (card && !card.contains(e.relatedTarget)) { card.style.removeProperty('--rx'); card.style.removeProperty('--ry'); }
    });
  }

  /* ---------------- server status (and waking sleeping servers) ---------------- */
  function setStatus(id, s) {
    status[id] = s;
    const el = $(`#card-${CSS.escape(id)} .status`);
    if (el) { el.dataset.s = s; el.lastElementChild.textContent = statusText[s]; }
  }

  async function check(g) {
    if (status[g.id] !== 'online') setStatus(g.id, 'checking');
    // the waking label appears if the server takes a while (a sleeping free server wakes up on this request)
    const slow = setTimeout(() => setStatus(g.id, 'waking'), 2500);
    const ctrl = new AbortController();
    const giveUp = setTimeout(() => ctrl.abort(), onOwnServer ? 8000 : 90000);
    try {
      if (onOwnServer && g.port) {
        const r = await fetch(`/status/${encodeURIComponent(g.id)}`, { cache: 'no-store', signal: ctrl.signal });
        setStatus(g.id, r.ok ? 'online' : 'offline');
      } else {
        // another origin: we can't read the answer (no CORS), but getting one at all means the server is up
        await fetch(g.backupUrl.replace(/\/$/, '') + (g.health || '/'), { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
        setStatus(g.id, 'online');
      }
    } catch {
      setStatus(g.id, 'offline');
    } finally {
      clearTimeout(slow); clearTimeout(giveUp);
    }
  }

  function checkAll() { games.forEach(check); }

  /* ---------------- sheets ---------------- */
  let lastFocus = null;
  function openSheet(wrap, vars) {
    lastFocus = document.activeElement;
    const sheet = $('.sheet', wrap);
    if (vars) Object.entries(vars).forEach(([k, v]) => sheet.style.setProperty(k, v));
    wrap.hidden = false;
    document.body.style.overflow = 'hidden';
    sheet.focus();
  }
  function closeSheet(wrap) {
    wrap.hidden = true;
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeSheet(e.target.closest('.sheet-wrap'));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.sheet-wrap:not([hidden])').forEach(closeSheet);
  });

  function openGame(id) {
    const g = games.find((x) => x.id === id); if (!g) return;
    $('#sheet-body').innerHTML = `
      <div class="sheet-head">
        <img src="${esc(g.icon)}" alt="" width="84" height="84" />
        <div><h2 id="sheet-title">${esc(g.name)}</h2><p style="margin:.3em 0 0">${esc(g.tagline)}</p></div>
      </div>
      <p>${esc(g.about)}</p>
      <div class="meta"><span>👥 ${esc(g.seats)}</span><span>⏱ ${esc(g.time)}</span></div>
      <h3>How to play</h3>
      <ul class="howto">${g.howTo.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      ${g.screenshots.length ? `<h3>Screenshots</h3><div class="shots">${g.screenshots.map((s, i) => `<img src="${esc(s)}" alt="${esc(g.name)} screenshot ${i + 1}" loading="lazy" />`).join('')}</div>` : ''}
      <div class="sheet-cta">
        <a class="btn primary play" href="${esc(gameUrl(g))}" data-play="${esc(g.id)}">Play ${esc(g.short || g.name)} <span class="arrow">→</span></a>
      </div>`;
    openSheet($('#sheet'), { '--bg1': g.bg[0], '--bg2': g.bg[1], '--accent': g.accent });
  }
  $('#sheet-body').addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); launch(play.dataset.play, play); }
  });

  /* ---------------- launching a game ---------------- */
  function launch(id, fromEl) {
    const g = games.find((x) => x.id === id); if (!g) return;
    const url = gameUrl(g);
    const el = $('#launch');
    const r = fromEl.getBoundingClientRect();
    el.style.setProperty('--x', r.left + r.width / 2 + 'px');
    el.style.setProperty('--y', r.top + r.height / 2 + 'px');
    el.style.setProperty('--bg1', g.bg[0]);
    el.style.setProperty('--bg2', g.bg[1]);
    el.style.setProperty('--accent', g.accent);
    $('#launch-icon').src = g.icon;
    $('#launch-title').textContent = `Opening ${g.name}`;
    $('#launch-note').textContent = status[g.id] === 'online' ? 'Get your friends ready!' : 'Waking up the game server. This can take a moment…';
    el.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
    setTimeout(() => { location.href = url; }, reduceMotion ? 50 : 650);
  }
  // coming back with the browser's Back button restores the page from cache: hide the overlay again
  addEventListener('pageshow', (e) => {
    if (e.persisted) { const el = $('#launch'); el.classList.remove('open'); el.hidden = true; checkAll(); }
  });

  /* ---------------- share + install ---------------- */
  let qrLoaded = null;
  function loadQR() {
    qrLoaded ??= new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    return qrLoaded;
  }
  const pageUrl = () => location.origin + location.pathname;

  $('#share-btn').addEventListener('click', async () => {
    $('#share-url').textContent = pageUrl().replace(/^https?:\/\//, '');
    openSheet($('#share'));
    try {
      await loadQR();
      const qr = window.qrcode(0, 'M');
      qr.addData(pageUrl()); qr.make();
      $('#qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
    } catch {
      $('#qr').textContent = 'QR code needs an internet connection.';
    }
  });
  $('#copy-btn').addEventListener('click', async () => {
    const url = pageUrl();
    if (navigator.share) {
      try { await navigator.share({ title: "Friend's Night", text: 'Game night! Pick a game:', url }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copied!'); } catch { toast(url); }
  });

  let installEvt = null;
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; $('#install-btn').hidden = false; });
  $('#install-btn').addEventListener('click', async () => {
    if (!installEvt) return;
    installEvt.prompt();
    await installEvt.userChoice;
    installEvt = null; $('#install-btn').hidden = true;
  });

  let toastT;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------------- start ---------------- */
  buildSky();
  fetch('games.json', { cache: 'no-cache' })
    .then((r) => r.json())
    .then((data) => {
      games = data.games;
      buildChips();
      renderCards();
      checkAll();
      // keep the lights honest while the page is open
      setInterval(() => { if (!document.hidden) checkAll(); }, 60000);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) checkAll(); });
    })
    .catch(() => {
      $('#grid').innerHTML = '<p style="text-align:center;color:var(--ink-soft)">Couldn\'t load the games list. Check your connection and refresh.</p>';
    });

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
