// Escape room tool (n5/escape-room.html). The questions are ordinary starter.js markup; this file
// only adds the game around them: a briefing, rooms that unlock one at a time, a door at the end of
// each room with one light per question, a mission clock, a code letter per room and a final screen.
//
//   [data-escape]     wrapper; data-key names its saved progress in localStorage
//   [data-briefing]   start screen, with a [data-start] button
//   [data-hud]        sticky bar: .hud-clock, .hud-penalty, .hud-code (filled in here), .hud-doors
//   .station-map      empty <nav>, filled in here with one button per room
//   .room             one room, hidden until it's reached. data-name, data-short (for the map),
//                     data-topic (for the final table) and data-letter (its part of the escape code).
//                     Its questions sit in .room-body, followed by an empty .door.
//   [data-end]        final screen, shown once the pod launches (a countdown over the last door, then
//                     .is-launching plays the arrival): [data-end-code], [data-end-time],
//                     [data-end-overrides], a .sparks box over the scene and a .topic-list
//                     [data-end-topics]. Its questions don't count towards anything.
//   [data-tools]      holds [data-restart] (tap twice to wipe progress) and a hidden [data-reset],
//                     which starter.js uses to clear every question.
//
// After three wrong answers to a calculation (.q-input in a room), an emergency override fills in
// the answer, which shows the working, and adds PENALTY seconds to the clock.
(function () {
  'use strict';

  const root = document.querySelector('[data-escape]');
  if (!root) return;

  const PENALTY = 120;
  const TRIES = 3;

  const rooms = [...root.querySelectorAll('.room')];
  const briefing = root.querySelector('[data-briefing]');
  const hud = root.querySelector('[data-hud]');
  const map = root.querySelector('.station-map');
  const end = root.querySelector('[data-end]');
  const tools = root.querySelector('[data-tools]');
  const restart = root.querySelector('[data-restart]');
  const clock = hud.querySelector('.hud-clock');
  const penaltyNote = hud.querySelector('.hud-penalty');
  const codeBox = hud.querySelector('.hud-code');
  const doorsOpen = hud.querySelector('.hud-doors');

  const questions = (room) => [...room.querySelectorAll('.room-body .q')];

  // ----- Saved progress (may not persist, for example inside Google's sandboxed frame) -----
  const fresh = () => ({ started: 0, finished: 0, launched: 0, cleared: 0, penalty: 0, overrides: 0, results: [] });
  let state = load();
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(root.dataset.key));
      if (s && typeof s.cleared === 'number') return Object.assign(fresh(), s);
    } catch (e) { /* no saved progress */ }
    return fresh();
  }
  function save() {
    try { localStorage.setItem(root.dataset.key, JSON.stringify(state)); } catch (e) { /* not saved */ }
  }

  // ----- Build the doors, the room bars, the map and the code slots -----
  const padlock = '<svg class="padlock" viewBox="0 0 40 48" aria-hidden="true">' +
    '<path class="shackle" d="M10 22V14a10 10 0 0 1 20 0v8" fill="none" stroke="#8fb0ff" stroke-width="5"/>' +
    '<rect class="body" x="4" y="20" width="32" height="26" rx="6" fill="#fbbf24"/>' +
    '<circle cx="20" cy="31" r="4" fill="#1d1442"/><path d="M20 33v6" stroke="#1d1442" stroke-width="4" stroke-linecap="round"/></svg>';

  rooms.forEach((room, i) => {
    const next = rooms[i + 1];
    const go = next ? 'Enter Room ' + (i + 2) + ': ' + next.dataset.name : 'Launch the escape pod';
    room.querySelector('.door').innerHTML =
      '<div class="door-beyond">' +
        '<p class="door-label">Code letter</p><p class="door-letter">' + room.dataset.letter + '</p>' +
        '<button type="button" class="launch" data-next>' + go + '</button>' +
      '</div>' +
      '<div class="door-leaf is-left"></div><div class="door-leaf is-right"></div>' +
      '<div class="door-panel" aria-live="polite">' + padlock +
        '<p class="door-status">Door sealed</p><p class="door-progress"></p>' +
        '<ul class="door-lights">' + questions(room).map(() => '<li></li>').join('') + '</ul>' +
      '</div>';
    room.querySelector('[data-next]').addEventListener('click', () => enter(i + 1));

    const bar = document.createElement('div');
    bar.className = 'room-bar';
    bar.innerHTML = '<p>Door open · Code letter <strong>' + room.dataset.letter + '</strong></p>' +
      '<button type="button" class="tool" data-look>Look back at this room</button>';
    room.querySelector('.room-head').after(bar);
    bar.querySelector('[data-look]').addEventListener('click', (e) => {
      const folded = room.classList.toggle('is-collapsed');
      e.currentTarget.textContent = folded ? 'Look back at this room' : 'Hide this room';
    });
  });

  map.innerHTML = rooms.map((room, i) =>
    '<button type="button" class="map-room" data-goto="' + i + '">' +
      '<span class="map-num">' + (i + 1) + '</span>' +
      '<span class="map-name">' + room.dataset.short + '</span>' +
      '<span class="map-state"></span></button>').join('');
  map.querySelectorAll('[data-goto]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const room = rooms[Number(btn.dataset.goto)];
      if (!room.hidden) room.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  codeBox.innerHTML = rooms.map(() => '<span class="code-slot"></span>').join('');

  // ----- Clock -----
  const fmt = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function elapsed() {
    if (!state.started) return 0;
    const stop = state.finished || Date.now();
    return Math.max(0, Math.floor((stop - state.started) / 1000)) + state.penalty;
  }
  function tick() {
    clock.textContent = fmt(elapsed());
    penaltyNote.textContent = state.penalty ? '+' + fmt(state.penalty) + ' penalty' : '';
  }
  setInterval(tick, 1000);

  // ----- Drawing the current state -----
  function render() {
    const on = !!state.started;
    briefing.hidden = on;
    hud.hidden = !on;
    map.hidden = !on;
    tools.hidden = !on;
    rooms.forEach((room, i) => {
      const cleared = i < state.cleared;
      room.hidden = !on || i > state.cleared;
      room.classList.toggle('is-cleared', cleared);
      room.querySelector('.door').classList.toggle('is-open', cleared);
      if (!cleared) room.classList.remove('is-collapsed');
    });
    end.hidden = !state.launched;
    if (!end.hidden) fillEnd();
    update();
    tick();
  }

  // Door lights, the map and the code: everything that changes as questions are answered
  function update() {
    rooms.forEach((room, i) => {
      const qs = questions(room);
      const cleared = i < state.cleared;
      const solved = cleared ? qs.length : qs.filter((q) => q.classList.contains('is-solved')).length;
      room.querySelectorAll('.door-lights li').forEach((li, n) => {
        li.classList.toggle('is-on', cleared || qs[n].classList.contains('is-solved'));
      });
      room.querySelector('.door-status').textContent = cleared ? 'Door open' : 'Door sealed';
      room.querySelector('.door-progress').textContent = solved + ' of ' + qs.length + ' locks open';

      // Only touch the class if it changes: this runs whenever a class on the page changes
      const btn = map.children[i];
      const kind = cleared ? 'cleared' : i === state.cleared ? 'current' : 'locked';
      if (btn.className !== 'map-room is-' + kind) btn.className = 'map-room is-' + kind;
      btn.disabled = kind === 'locked';
      btn.querySelector('.map-state').textContent = { cleared: 'Open', current: 'You are here', locked: 'Locked' }[kind];
    });
    [...codeBox.children].forEach((slot, i) => {
      const letter = i < state.cleared ? rooms[i].dataset.letter : '';
      slot.textContent = letter;
      slot.classList.toggle('is-filled', !!letter);
    });
    doorsOpen.textContent = state.cleared + ' of ' + rooms.length;
  }

  // ----- Watching the questions: a room is cleared once every question in it is solved -----
  function check() {
    update();
    if (!state.started || state.cleared >= rooms.length) return;
    const room = rooms[state.cleared];
    const qs = questions(room);
    if (qs.some((q) => !q.classList.contains('is-solved'))) return;

    const i = state.cleared;
    state.results[i] = { first: qs.filter((q) => !('slipped' in q.dataset)).length, total: qs.length };
    state.cleared = i + 1;
    if (state.cleared === rooms.length) state.finished = Date.now();
    save();
    render();
    const slot = codeBox.children[i];
    slot.classList.remove('is-new');
    void slot.offsetWidth; // restart the pop animation
    slot.classList.add('is-new');
  }
  new MutationObserver(check).observe(root, { attributes: true, attributeFilter: ['class'], subtree: true });

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Go through a door: fold the room just finished away, then show the next one.
  // The last door launches the pod instead.
  function enter(i) {
    if (i === rooms.length && !state.launched) { launch(); return; }
    const target = rooms[i] || end;
    if (rooms[i - 1]) {
      rooms[i - 1].classList.add('is-collapsed');
      const look = rooms[i - 1].querySelector('[data-look]');
      look.textContent = 'Look back at this room';
    }
    target.classList.remove('is-entering');
    void target.offsetWidth;
    target.classList.add('is-entering');
    target.scrollIntoView({ block: 'start' });
  }

  // ----- Emergency overrides -----
  let tries = new WeakMap();
  function afterCheck(q) {
    // Only in the room the pupil is working on, not in a cleared room they've gone back to
    if (!q || !q.classList.contains('q-input') || q.classList.contains('is-solved')) return;
    if (!state.started || rooms.indexOf(q.closest('.room')) !== state.cleared) return;
    const box = q.querySelector('.q-feedback');
    if (!/\d/.test(q.querySelector('.answer').value) || !box.classList.contains('is-bad')) return;
    const n = (tries.get(q) || 0) + 1;
    tries.set(q, n);
    if (n >= TRIES && !q.querySelector('.override')) offerOverride(q);
  }
  function offerOverride(q) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tool override';
    btn.textContent = 'Emergency override (adds 2 minutes)';
    btn.addEventListener('click', () => {
      state.penalty += PENALTY;
      state.overrides += 1;
      save();
      q.classList.add('is-overridden');
      q.querySelector('.answer').value = q.dataset.answer;
      btn.remove();
      q.querySelector('.q-check').click();
      const title = q.querySelector('.q-feedback strong');
      if (title) title.textContent = 'Override used.';
      tick();
    });
    q.querySelector('.answer-row').after(btn);
  }
  // These run after starter.js has marked the answer, since its listeners sit on the button itself
  root.addEventListener('click', (e) => {
    const b = e.target.closest('.q-check');
    if (b) afterCheck(b.closest('.q'));
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('.answer')) afterCheck(e.target.closest('.q'));
  });

  // ----- Launch: 3, 2, 1 over the last door, then the final screen plays its arrival -----
  let countdown = null;
  function launch() {
    const door = rooms[rooms.length - 1].querySelector('.door');
    if (countdown || reduceMotion()) { if (!countdown) blastOff(false); return; }
    const box = document.createElement('div');
    box.className = 'countdown';
    door.append(box);
    const steps = ['3', '2', '1', 'Launch!'];
    let n = 0;
    const show = () => {
      box.classList.toggle('is-go', n === steps.length - 1);
      box.innerHTML = '<span>' + steps[n] + '</span>';
    };
    show();
    countdown = setInterval(() => {
      n += 1;
      if (n < steps.length) { show(); return; }
      clearInterval(countdown);
      countdown = null;
      box.remove();
      blastOff(true);
    }, 750);
  }
  function blastOff(animate) {
    state.launched = Date.now();
    save();
    render();
    enter(rooms.length);
    if (animate) play();
  }

  // The arrival: sparks burst from the pod and the escape time counts up
  const SPARK_COLOURS = ['#fbbf24', '#5eead4', '#f68cc4', '#8fb0ff', '#ffffff'];
  function play() {
    const card = end.querySelector('.end-card');
    const sparks = end.querySelector('.sparks');
    card.classList.remove('is-launching');
    void card.offsetWidth; // restart the animations
    card.classList.add('is-launching');
    sparks.innerHTML = Array.from({ length: 36 }, (_, k) => {
      const angle = (k / 36) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 90 + Math.random() * 170;
      const style = '--dx:' + Math.round(Math.cos(angle) * dist) + 'px;--dy:' + Math.round(Math.sin(angle) * dist * 0.7) + 'px;' +
        '--r:' + Math.round(Math.random() * 540 - 270) + 'deg;--d:' + (Math.random() * 0.25).toFixed(2) + 's;' +
        '--c:' + SPARK_COLOURS[k % SPARK_COLOURS.length];
      return '<span class="spark' + (k % 3 ? '' : ' is-round') + '" style="' + style + '"></span>';
    }).join('');
    const timeBox = end.querySelector('[data-end-time]');
    const total = elapsed();
    const begin = performance.now() + 2900; // when the time line appears
    const run = (now) => {
      const f = Math.min(1, Math.max(0, (now - begin) / 1200));
      timeBox.textContent = fmt(Math.round(total * (1 - Math.pow(1 - f, 3))));
      if (f < 1) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  // ----- Final screen -----
  function fillEnd() {
    end.querySelector('[data-end-code]').innerHTML = rooms.map((r, i) => '<span style="--i:' + i + '">' + r.dataset.letter + '</span>').join('');
    end.querySelector('[data-end-time]').textContent = fmt(elapsed());
    end.querySelector('[data-end-overrides]').textContent = String(state.overrides);
    end.querySelector('[data-end-topics]').innerHTML = rooms.map((room, i) => {
      const r = state.results[i] || { first: 0, total: questions(room).length };
      let kind = 'bad';
      let status = 'Work on this';
      if (r.first === r.total) { kind = 'good'; status = 'Secure'; }
      else if (r.first * 2 >= r.total) { kind = 'ok'; status = 'Nearly there'; }
      return '<li class="topic is-' + kind + '"><span class="topic-name">' + room.dataset.topic + '</span>' +
        '<span class="topic-score">' + r.first + ' of ' + r.total + ' right first time</span>' +
        '<span class="topic-status">' + status + '</span></li>';
    }).join('');
  }

  // ----- Start and start again -----
  root.querySelector('[data-start]').addEventListener('click', () => {
    state = fresh();
    state.started = Date.now();
    save();
    render();
    enter(0);
  });

  let disarm = null;
  restart.addEventListener('click', () => {
    if (!restart.classList.contains('is-armed')) {
      restart.classList.add('is-armed');
      restart.textContent = 'Tap again to wipe your progress';
      disarm = setTimeout(() => {
        restart.classList.remove('is-armed');
        restart.textContent = 'Start again';
      }, 4000);
      return;
    }
    clearTimeout(disarm);
    restart.classList.remove('is-armed');
    restart.textContent = 'Start again';
    state = fresh();
    save();
    tries = new WeakMap();
    root.querySelectorAll('.is-overridden').forEach((q) => q.classList.remove('is-overridden'));
    clearInterval(countdown);
    countdown = null;
    root.querySelectorAll('.countdown').forEach((box) => box.remove());
    end.querySelector('.end-card').classList.remove('is-launching');
    end.querySelector('.sparks').innerHTML = '';
    rooms.forEach((room) => {
      room.classList.remove('is-collapsed', 'is-entering');
      room.querySelector('[data-look]').textContent = 'Look back at this room';
    });
    root.querySelector('[data-reset]').click(); // starter.js clears every question
    render();
  });

  // Coming back to a mission in progress: rooms already cleared start folded away,
  // except the last one if the pod hasn't launched yet, so its Launch button shows
  rooms.forEach((room, i) => {
    if (i < state.cleared && (state.launched || i < rooms.length - 1)) room.classList.add('is-collapsed');
  });
  render();
})();
