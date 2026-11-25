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
      end.querySelector('.pg-final-score').textContent = score + ' out of ' + total;
      end.querySelector('.pg-final-time').textContent = clock();
      const ranks = (end.dataset.ranks || '').split('|').map((s) => s.split(':'));
      const rank = ranks.find(([min]) => score >= Number(min));
      end.querySelector('.pg-rank').textContent = rank ? rank[1] : '';
      say('');
      planets.forEach((p) => p.classList.add('is-found'));
    }

    function begin() {
      gen++;
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

    game.querySelectorAll('[data-pg-restart]').forEach((b) => b.addEventListener('click', begin));
    begin();
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
