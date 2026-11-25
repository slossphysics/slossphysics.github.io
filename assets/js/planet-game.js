// Planet match-up game (bge/starters/space-planet-match-up.html). Markup does the content; this does the play.
//
//   [data-planet-game]        the whole game. Inside it:
//   .pg-planet                one button per planet in the space row (data-key, data-type), in order from the Sun.
//                             Pluto (data-extra) waits hidden until the sort round needs it.
//   .pg-round                 the rounds, played in order. data-title names the round in the top bar.
//     data-round="clues"      one .pg-clue at a time (shuffled unless data-fixed): pupils drag the clue card onto a
//                             planet, or tap the planet. .pg-clue has data-answer (a planet key) and data-hint
//                             (shown after a wrong answer); <p class="pg-wrong" data-for="key"> gives a message for
//                             a particular wrong planet; <p class="pg-fact"> is shown once it is right.
//                             data-challenge on the round tags it "Challenge".
//     data-round="sort"       pupils drag each planet (or tap it, then tap a bay) into a .pg-bay (data-type).
//                             data-msg-<type> on the round is the message for a planet put in the wrong bay
//                             ({name} is replaced by the planet's name). Extra planets join once the row is empty.
//   .pg-score, .pg-time, .pg-progress   live readouts in the top bar
//   .pg-end                   shown at the end; .pg-final-score, .pg-final-time, .pg-rank are filled in;
//                             data-ranks="16:Title|11:Title|0:Title" (lowest score for each title).
//   [data-pg-restart]         Play again.
// Each first-time-right answer scores a point. Nothing is saved anywhere.
(function () {
  'use strict';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-planet-game]').forEach(setUp);

  function setUp(game) {
    const row = game.querySelector('.pg-planets');
    const planets = [...game.querySelectorAll('.pg-planet')];
    const homes = new Map(planets.map((p) => [p, p.parentElement])); // each planet's <li> in the row
    const rounds = [...game.querySelectorAll('.pg-round')];
    const stage = game.querySelector('.pg-stage');
    const feedback = game.querySelector('.pg-feedback');
    const scoreEl = game.querySelector('.pg-score');
    const timeEl = game.querySelector('.pg-time');
    const progressEl = game.querySelector('.pg-progress');
    const roundEl = game.querySelector('.pg-round-name');
    const end = game.querySelector('.pg-end');
    const total = rounds.reduce((n, r) => n + (r.dataset.round === 'clues' ? r.querySelectorAll('.pg-clue').length
      : planets.length), 0);

    let score = 0, started = 0, tick = null, stop = null, gen = 0;
    // Timers that belong to one play-through: a restart makes them do nothing
    const later = (fn, ms) => { const g = gen; setTimeout(() => { if (g === gen) fn(); }, ms); };

    const say = (text, kind) => {
      feedback.textContent = text;
      feedback.className = 'pg-feedback' + (kind ? ' is-' + kind : '');
    };
    const name = (p) => p.querySelector('.pg-name').textContent;
    const showScore = () => { scoreEl.textContent = score + ' / ' + total; };
    const clock = () => {
      const s = Math.round((Date.now() - started) / 1000);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };

    function shake(el) {
      el.classList.remove('pg-shake');
      void el.offsetWidth; // restart the animation
      el.classList.add('pg-shake');
    }

    // Move an element to a new parent, sliding it there from where it was (FLIP)
    function flyInto(el, parent, before) {
      const a = el.getBoundingClientRect();
      parent.insertBefore(el, before || null);
      if (reduceMotion) return;
      const b = el.getBoundingClientRect();
      el.animate([
        { transform: `translate(${a.left - b.left}px, ${a.top - b.top}px) scale(${a.width / b.width})` },
        { transform: 'none' }
      ], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }

    // Generic drag: press, move past 8 px, and the element follows the finger. onDrop(x, y) decides what happens;
    // if it returns false the element glides back. A plain tap is left to the click handler.
    function draggable(el, onDrop, onStart) {
      let start = null, over = null;
      const down = (e) => {
        if (e.button > 0 || el.disabled) return;
        el.getAnimations().forEach((an) => an.finish()); // grabbed again while still sliding
        start = { x: e.clientX, y: e.clientY, id: e.pointerId, moving: false };
        el.setPointerCapture(e.pointerId);
      };
      const move = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!start.moving) {
          if (Math.hypot(dx, dy) < 8) return;
          start.moving = true;
          el.classList.add('is-dragging');
          if (onStart) onStart();
        }
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        const t = targetAt(el, e.clientX, e.clientY);
        if (t !== over) {
          if (over) over.classList.remove('is-over');
          over = t;
          if (over) over.classList.add('is-over');
        }
      };
      const up = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const s = start;
        start = null;
        if (!s.moving) return;
        el.dataset.dragged = '1';
        setTimeout(() => { delete el.dataset.dragged; }, 0);
        el.classList.remove('is-dragging');
        if (over) over.classList.remove('is-over');
        const t = e.type === 'pointerup' ? over : null;
        over = null;
        const kept = t && onDrop(t);
        if (kept) { el.style.transform = ''; return; }
        // glide back
        const from = el.style.transform;
        el.style.transform = '';
        if (!reduceMotion && from) el.animate([{ transform: from }, { transform: 'none' }], { duration: 250, easing: 'ease-out' });
      };
      el.addEventListener('pointerdown', down);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      return () => {
        el.removeEventListener('pointerdown', down);
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
    }
    // What the dragged thing is over: a planet in the row or a bay (only ones marked as drop targets)
    function targetAt(el, x, y) {
      const hit = document.elementsFromPoint(x, y).find((n) => !el.contains(n));
      const t = hit && hit.closest('.pg-drop');
      return t && game.contains(t) ? t : null;
    }

    // ---------- clue rounds ----------
    function playClues(round, next) {
      const clues = [...round.querySelectorAll('.pg-clue')];
      if (!('fixed' in round.dataset)) shuffle(clues).forEach((c) => c.parentElement.appendChild(c));
      planets.filter((p) => !('extra' in p.dataset)).forEach((p) => p.classList.add('pg-drop'));
      let i = 0, wrong = false, busy = false;
      const offs = [];

      const show = () => {
        clues.forEach((c, k) => { c.hidden = k !== i; c.classList.remove('is-gone'); });
        progressEl.textContent = 'Clue ' + (i + 1) + ' of ' + clues.length;
        wrong = false;
        say('');
      };
      const answer = (planet) => {
        if (busy) return false;
        const clue = clues[i];
        if (planet.dataset.key === clue.dataset.answer) {
          busy = true;
          if (!wrong) { score++; showScore(); }
          const fact = clue.querySelector('.pg-fact');
          say('Correct! ' + (fact ? fact.textContent : ''), 'good');
          planet.classList.add('is-found');
          // the clue card shrinks into the planet
          if (!reduceMotion) {
            const a = clue.getBoundingClientRect(), b = planet.getBoundingClientRect();
            clue.animate([{ transform: clue.style.transform || 'none', opacity: 1 },
              { transform: `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.15)`, opacity: 0 }],
            { duration: 500, easing: 'ease-in', fill: 'forwards' });
          }
          later(() => {
            clue.getAnimations().forEach((an) => an.cancel());
            clue.style.transform = '';
            busy = false;
            i++;
            if (i < clues.length) show(); else finish();
          }, 1500);
          return true;
        }
        wrong = true;
        shake(planet);
        const special = clue.querySelector(`.pg-wrong[data-for="${planet.dataset.key}"]`);
        say('Not quite. ' + (special ? special.textContent : clue.dataset.hint), 'bad');
        return false;
      };
      const onTap = (e) => {
        const p = e.target.closest('.pg-planet');
        if (!p || !p.classList.contains('pg-drop') || p.dataset.dragged) return;
        answer(p);
      };
      row.addEventListener('click', onTap);
      clues.forEach((c) => offs.push(draggable(c, (t) => t.classList.contains('pg-planet') && answer(t))));

      function teardown() {
        row.removeEventListener('click', onTap);
        offs.forEach((f) => f());
        clues.forEach((c) => { c.getAnimations().forEach((an) => an.cancel()); c.style.transform = ''; });
        planets.forEach((p) => p.classList.remove('pg-drop', 'is-found'));
      }
      function finish() { teardown(); next(); }
      show();
      return teardown;
    }

    // ---------- sort round ----------
    function playSort(round, next) {
      const bays = [...round.querySelectorAll('.pg-bay')];
      bays.forEach((b) => b.classList.add('pg-drop'));
      const extras = planets.filter((p) => 'extra' in p.dataset);
      let left = planets.length, selected = null;
      const tried = new Set();
      const offs = [];
      const select = (p) => {
        if (selected) selected.classList.remove('is-selected');
        selected = p;
        if (p) p.classList.add('is-selected');
      };
      const progress = () => { progressEl.textContent = (planets.length - left) + ' of ' + planets.length + ' sorted'; };

      const place = (planet, bay) => {
        if (planet.dataset.type === bay.dataset.type) {
          if (!tried.has(planet)) { score++; showScore(); }
          select(null);
          flyInto(planet, bay.querySelector('.pg-bay-slot'));
          planet.classList.add('is-sorted');
          planet.disabled = true;
          say('Correct! ' + name(planet) + ' goes with the ' + bay.querySelector('h3').textContent.toLowerCase() + '.', 'good');
          left--;
          progress();
          if (left === extras.length) extras.forEach((x) => { x.parentElement.hidden = false; x.classList.add('pg-arrive'); });
          if (left === 0) later(finish, 1300);
          return true;
        }
        tried.add(planet);
        shake(bay);
        const msg = (round.dataset['msg' + cap(planet.dataset.type)] || '').replace('{name}', name(planet));
        say('Not quite. ' + msg, 'bad');
        return false;
      };

      const onRowTap = (e) => {
        const p = e.target.closest('.pg-planet');
        if (!p || p.disabled || p.dataset.dragged) return;
        select(selected === p ? null : p);
        if (selected) say('Now tap the group ' + name(p) + ' belongs in.');
      };
      const onBayTap = (e) => {
        const bay = e.currentTarget;
        if (!selected) { say('Tap a planet first, or drag it here.'); return; }
        place(selected, bay);
      };
      row.addEventListener('click', onRowTap);
      bays.forEach((b) => b.addEventListener('click', onBayTap));
      planets.forEach((p) => offs.push(draggable(p, (t) => t.classList.contains('pg-bay') && place(p, t), () => select(null))));

      function teardown() {
        row.removeEventListener('click', onRowTap);
        bays.forEach((b) => { b.removeEventListener('click', onBayTap); b.classList.remove('pg-drop'); });
        offs.forEach((f) => f());
        select(null);
        // everyone back into orbit for the next round
        planets.forEach((p) => {
          p.disabled = false;
          p.classList.remove('is-sorted', 'pg-arrive');
          if (p.parentElement !== homes.get(p)) flyInto(p, homes.get(p));
        });
        extras.forEach((x) => { x.parentElement.hidden = true; });
      }
      function finish() { teardown(); next(); }
      progress();
      say('');
      return teardown;
    }

    function startRound(k) {
      rounds.forEach((r, j) => { r.hidden = j !== k; });
      if (k >= rounds.length) return gameOver();
      const r = rounds[k];
      // From round 2 on, bring the game to the top of the screen so the planets and the play area fit together
      // on an iPad in landscape (about 690 px of page)
      if (k > 0 && game.getBoundingClientRect().top < -5 || k > 0 && game.getBoundingClientRect().bottom > innerHeight) {
        game.scrollIntoView({ block: 'start', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      roundEl.textContent = r.dataset.title || '';
      game.classList.toggle('is-challenge', 'challenge' in r.dataset);
      game.dataset.mode = r.dataset.round;
      const next = () => { stop = null; later(() => startRound(k + 1), 900); };
      stop = r.dataset.round === 'sort' ? playSort(r, next) : playClues(r, next);
    }

    function gameOver() {
      clearInterval(tick);
      game.dataset.mode = 'end';
      roundEl.textContent = 'Finished';
      game.classList.remove('is-challenge');
      progressEl.textContent = 'All done';
      stage.hidden = true;
      end.hidden = false;
      const ranks = (end.dataset.ranks || '').split('|').map((s) => s.split(':'));
      const rank = ranks.find(([min]) => score >= Number(min));
      const fill = (sel, text) => game.querySelectorAll(sel).forEach((el) => { el.textContent = text; });
      fill('.pg-final-score', score + ' out of ' + total);
      fill('.pg-final-time', clock());
      fill('.pg-rank', rank ? rank[1] : '');
      say('');
      planets.forEach((p) => p.classList.add('is-found'));
      // The finale: the space panel grows to fill the screen and the planets go into orbit
      if (orbits) later(() => orbits.open(), 1100);
    }

    function begin() {
      gen++;
      if (orbits) orbits.close(true);
      if (stop) { const s = stop; stop = null; s(); }
      clearInterval(tick);
      score = 0;
      showScore();
      started = Date.now();
      timeEl.textContent = '0:00';
      tick = setInterval(() => { timeEl.textContent = clock(); }, 1000);
      stage.hidden = false;
      end.hidden = true;
      planets.forEach((p) => {
        p.classList.remove('is-found', 'is-sorted', 'is-selected', 'pg-drop');
        p.disabled = false;
        if (p.parentElement !== homes.get(p)) homes.get(p).appendChild(p);
        if ('extra' in p.dataset) homes.get(p).hidden = true;
      });
      startRound(0);
    }

    const orbits = makeOrbits(game, planets);
    game.querySelectorAll('[data-pg-restart]').forEach((b) => b.addEventListener('click', begin));
    game.querySelectorAll('[data-pg-orbits]').forEach((b) => b.addEventListener('click', () => orbits && orbits.open()));
    begin();
  }

  // ---------- the finale: a full-screen view of the planets in orbit ----------
  // .pg-orrery holds .pg-sky (filled in here), [data-pg-close], [data-pg-pause], [data-pg-slower], [data-pg-faster],
  // [data-pg-full], .pg-speed and .pg-years. Each .pg-planet with data-au (distance from the Sun), data-year (time for
  // one orbit, in Earth years) and data-l0 (where it was on 1 January 2000, degrees round from the same start line)
  // goes into orbit. Periods are real; distances are squashed (log scale) so the inner planets still fit.
  function makeOrbits(game, planets) {
    const box = game.querySelector('.pg-orrery');
    if (!box) return null;
    const sky = box.querySelector('.pg-sky');
    const list = planets.filter((p) => p.dataset.au);
    const SPEEDS = [8, 4, 2, 1, 0.5, 0.2, 0.05]; // seconds for one Earth year
    const NS = 'http://www.w3.org/2000/svg';
    const J2000 = Date.UTC(2000, 0, 1, 12);
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'pg-orbit-lines');
    svg.setAttribute('aria-hidden', 'true');
    sky.appendChild(svg);
    const sun = document.createElement('div');
    sun.className = 'pg-o-sun';
    sun.innerHTML = '<span>Sun</span>';
    sky.appendChild(sun);
    const lnA = list.map((p) => Math.log(Number(p.dataset.au)));
    const lo = Math.min(...lnA), hi = Math.max(...lnA);
    const bodies = list.map((p, i) => {
      const el = document.createElement('div');
      el.className = 'pg-o-planet' + (p.classList.contains('is-ringed') ? ' is-ringed' : '');
      const img = p.querySelector('img').cloneNode();
      img.alt = '';
      const label = document.createElement('span');
      label.textContent = p.querySelector('.pg-name').textContent;
      el.append(img, label);
      el.style.setProperty('--d', getComputedStyle(p).getPropertyValue('--d'));
      sky.appendChild(el);
      const line = document.createElementNS(NS, 'ellipse');
      svg.appendChild(line);
      return { p, el, line, T: Number(p.dataset.year), l0: Number(p.dataset.l0) * Math.PI / 180,
        r: 0.21 + 0.79 * (lnA[i] - lo) / (hi - lo), from: null };
    });

    let speed = 1, playing = !reduceMotion, years = 0, raf = 0, last = 0, opened = 0, g = null;
    const speedEl = box.querySelector('.pg-speed');
    const yearsEl = box.querySelector('.pg-years');
    const pauseBtn = box.querySelector('[data-pg-pause]');
    const fullBtn = box.querySelector('[data-pg-full]');
    const showSpeed = () => {
      const s = SPEEDS[speed];
      speedEl.textContent = '1 Earth year = ' + (s === 0.5 ? 'half a second' : s + (s === 1 ? ' second' : ' seconds'));
      box.querySelector('[data-pg-slower]').disabled = speed === 0;
      box.querySelector('[data-pg-faster]').disabled = speed === SPEEDS.length - 1;
    };
    const showPlay = () => { pauseBtn.textContent = playing ? 'Pause' : 'Play'; };

    // Sizes of the view: a tilted ellipse, as if looking down at the orbits at an angle
    function layout() {
      const W = sky.clientWidth, H = sky.clientHeight;
      // tilt more on wide screens, less on tall ones, so the orbits fill the space either way
      const tilt = Math.max(0.56, Math.min(0.85, (H / 2 - 34) / (W / 2 - 50)));
      const rx = Math.max(60, Math.min(W / 2 - 50, (H / 2 - 34) / tilt));
      g = { cx: W / 2, cy: H / 2, rx, ry: rx * tilt, k: Math.max(0.55, Math.min(1.2, Math.min(W, H * 1.6) / 900)) };
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      sun.style.setProperty('--sun', 74 * g.k + 'px');
      sun.style.left = g.cx + 'px';
      sun.style.top = g.cy + 'px';
      bodies.forEach((b) => {
        b.line.setAttribute('cx', g.cx);
        b.line.setAttribute('cy', g.cy);
        b.line.setAttribute('rx', g.rx * b.r);
        b.line.setAttribute('ry', g.ry * b.r);
        b.el.style.setProperty('--k', g.k);
      });
    }
    function place(b, t) {
      const a = b.l0 + 2 * Math.PI * (b.start + years) / b.T;
      let x = g.cx + g.rx * b.r * Math.cos(a);
      let y = g.cy - g.ry * b.r * Math.sin(a);
      if (b.from && t < 1) { // gliding in from the row of planets
        const e = 1 - Math.pow(1 - t, 3);
        x = b.from.x + (x - b.from.x) * e;
        y = b.from.y + (y - b.from.y) * e;
      }
      const depth = (y - g.cy) / g.ry; // -1 at the back, +1 at the front
      b.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${0.85 + 0.15 * (depth + 1) / 2})`;
      b.el.style.zIndex = y < g.cy ? 1 : 3; // behind the Sun on the far side
    }
    function frame(now) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (playing) years += dt / SPEEDS[speed];
      const t = reduceMotion ? 1 : (now - opened) / 1400;
      bodies.forEach((b) => place(b, t));
      yearsEl.textContent = years.toFixed(1);
      raf = requestAnimationFrame(frame);
    }

    function open() {
      if (!box.hidden) return;
      const panel = game.querySelector('.pg-space').getBoundingClientRect();
      box.hidden = false;
      document.documentElement.classList.add('pg-locked');
      layout();
      const skyBox = sky.getBoundingClientRect();
      const yearsNow = (Date.now() - J2000) / 3.15576e10; // years since 1 January 2000
      bodies.forEach((b) => {
        b.start = yearsNow;
        const r = b.p.getBoundingClientRect();
        b.from = r.width ? { x: r.left + r.width / 2 - skyBox.left, y: r.top + r.height / 2 - skyBox.top } : null;
      });
      years = 0;
      last = 0;
      playing = !reduceMotion;
      showSpeed();
      showPlay();
      opened = performance.now();
      // grow out of the space panel to fill the screen
      if (!reduceMotion && box.animate) {
        const W = innerWidth, H = innerHeight;
        box.animate([
          { clipPath: `inset(${panel.top}px ${W - panel.right}px ${H - panel.bottom}px ${panel.left}px round 16px)` },
          { clipPath: 'inset(0 0 0 0 round 0)' }
        ], { duration: 700, easing: 'cubic-bezier(.3,.7,.2,1)' });
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(frame);
      box.querySelector('[data-pg-close]').focus({ preventScroll: true });
    }
    function close(quiet) {
      if (box.hidden) return;
      cancelAnimationFrame(raf);
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      }
      box.hidden = true;
      document.documentElement.classList.remove('pg-locked');
      if (!quiet) game.scrollIntoView({ block: 'start' });
    }

    box.querySelector('[data-pg-close]').addEventListener('click', () => close());
    pauseBtn.addEventListener('click', () => { playing = !playing; showPlay(); });
    box.querySelector('[data-pg-slower]').addEventListener('click', () => { if (speed > 0) speed--; showSpeed(); });
    box.querySelector('[data-pg-faster]').addEventListener('click', () => { if (speed < SPEEDS.length - 1) speed++; showSpeed(); });
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !document.fullscreenElement) close(); });
    addEventListener('resize', () => { if (!box.hidden) layout(); });
    // Real full screen where the browser allows it (iPad Safari does; a Google Sites box may not)
    const canFull = (document.fullscreenEnabled || document.webkitFullscreenEnabled) && (box.requestFullscreen || box.webkitRequestFullscreen);
    if (fullBtn && canFull) {
      fullBtn.hidden = false;
      fullBtn.addEventListener('click', () => {
        if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else (box.requestFullscreen || box.webkitRequestFullscreen).call(box);
      });
      const label = () => { fullBtn.textContent = (document.fullscreenElement || document.webkitFullscreenElement) ? 'Exit full screen' : 'Full screen'; };
      document.addEventListener('fullscreenchange', label);
      document.addEventListener('webkitfullscreenchange', label);
    }
    return { open, close };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
})();
