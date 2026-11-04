// Shared starter engine. Pages opt in with markup only; nothing here is page-specific.
//
//   .q.q-mcq     multiple choice: .option buttons, mark the right one with data-correct.
//                Optional data-feedback on wrong options, and a hidden .q-explain shown
//                once the question is solved (or when the teacher shows answers).
//                Mark several options data-correct for "tap all that apply": the question is
//                solved once every correct option has been found.
//   .q.q-match   tap-to-match: .match-item buttons (in .match-items) and .match-target buttons
//                (in .match-targets) that pair up by data-key. Pupils drag an item onto its
//                target, or tap one then the other. A matched item moves into a slot above its
//                target. Give each .match-item a data-label for Show answers.
//                Add .is-sort to the .match box to sort into groups: several items can share a
//                target's data-key, and they stack up in its slot.
//                Add .is-order instead to put sentences in order: the targets are the places
//                ("1", "2", …, and optionally "Not needed" for wrong sentences, which can share a key),
//                listed down the page with each slot beside its number.
//                For short words (a spectrum, a scale of sizes) add .is-strip too, with
//                style="--steps: 7" for the number of places: the places sit side by side in a row.
//   .q.q-input   type-in number: an <input class="answer"> and a .q-check button; the .q has
//                data-answer and optional data-tol (fraction allowed either way, default 0.02).
//                Optional hidden <p class="mistake" data-value="…"> elements give targeted
//                feedback for common wrong answers.
//   .q.q-truth   truth table: .truth-cell buttons with data-answer="0" or "1". Tapping a cell
//                cycles ? → 0 → 1; the .q-check button marks the whole table.
//                Give the .q data-options="BB Bb bb" to cycle through other choices instead,
//                for example the boxes of a Punnett square.
//   .q-feedback  empty element inside each .q where feedback is written (aria-live).
//   .hint        optional <details class="hint"><summary>Hint</summary><p>…</p></details> inside a .q.
//                Needs no script; Reset closes it again.
//   .q-section   optional heading (<h2 class="q-section">Waves</h2>) that starts a group of questions,
//                for revision starters that cover several topics.
//   [data-topic-check]  box holding an empty <ul class="topic-list">: one row per .q-section, saying
//                how many of its questions were right first time, so pupils see what to revise.
//                The Challenge question is left out of the counts.
//   [data-show-answers]  button that toggles answers for the whole page. Used by the circuit
//                        tools only: starters leave it out, since pupils could tap it.
//   [data-reset]         button that clears every answer on the page.
//   [data-timer]         countdown: a <select> of minutes, .timer-display, [data-timer-toggle].
(function () {
  'use strict';

  const originals = new Map();

  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

  // Animate a box's size so whatever sits below it slides along instead of jumping.
  // A newer animation on the same box replaces the older one. With clip, the box hides
  // its contents while it is smaller than them.
  const sizing = new WeakMap();
  function resizeBox(el, frames, opts, clip) {
    const old = sizing.get(el);
    if (old) old.cancel();
    const a = el.animate(frames, Object.assign({ duration: 350, easing: EASE }, opts));
    sizing.set(el, a);
    if (clip) el.style.overflow = 'hidden';
    const done = () => {
      if (sizing.get(el) !== a) return;
      sizing.delete(el);
      if (clip) el.style.overflow = '';
    };
    a.addEventListener('finish', done);
    a.addEventListener('cancel', done);
    return a;
  }

  // Run a DOM change, then ease the box from its old height to its new one
  function easeHeight(el, change, clip) {
    const was = el.offsetHeight;
    const old = sizing.get(el);
    if (old) old.cancel();
    change();
    const now = el.offsetHeight;
    if (was !== now && !reduceMotion()) {
      resizeBox(el, [{ height: was + 'px' }, { height: now + 'px' }], {}, clip);
    }
  }

  function say(q, kind, title, html) {
    const box = q.querySelector('.q-feedback');
    if (!box) return;
    const write = () => {
      box.className = 'q-feedback is-' + kind;
      box.innerHTML = '<strong>' + title + '</strong> ' + (html || '');
    };
    if (box.innerHTML) {
      easeHeight(box, write, true);
      return;
    }
    // The first message fades in, with its height, padding and margin growing from nothing
    write();
    if (reduceMotion()) return;
    const s = getComputedStyle(box);
    resizeBox(box, [
      { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginTop: '0px', opacity: 0 },
      { height: box.offsetHeight + 'px', paddingTop: s.paddingTop, paddingBottom: s.paddingBottom, marginTop: s.marginTop, opacity: 1 }
    ], {}, true);
  }

  function solve(q) {
    q.classList.add('is-solved');
    q.querySelectorAll('button, input').forEach((b) => { b.disabled = true; });
    updateTopicCheck();
  }

  // A wrong answer: the topic check no longer counts this question as right first time
  function slip(q) { q.dataset.slipped = ''; }

  const topicCheck = document.querySelector('[data-topic-check] .topic-list');
  function updateTopicCheck() {
    if (!topicCheck) return;
    const groups = [];
    document.querySelectorAll('.q-section, .q').forEach((el) => {
      if (el.classList.contains('q-section')) groups.push({ name: el.textContent, qs: [] });
      else if (groups.length && !el.classList.contains('q-challenge')) groups[groups.length - 1].qs.push(el);
    });
    topicCheck.innerHTML = groups.map((g) => {
      const total = g.qs.length;
      const done = g.qs.filter((q) => q.classList.contains('is-solved')).length;
      const first = g.qs.filter((q) => q.classList.contains('is-solved') && !('slipped' in q.dataset)).length;
      let kind = 'todo';
      let status = done + ' of ' + total + ' done';
      if (done === total) {
        if (first === total) { kind = 'good'; status = 'Secure'; }
        else if (first * 2 >= total) { kind = 'ok'; status = 'Nearly there'; }
        else { kind = 'bad'; status = 'Work on this'; }
      }
      return '<li class="topic is-' + kind + '"><span class="topic-name">' + g.name + '</span>' +
        '<span class="topic-score">' + first + ' of ' + total + ' right first time</span>' +
        '<span class="topic-status">' + status + '</span></li>';
    }).join('');
  }

  function initMcq(q) {
    const explain = q.querySelector('.q-explain');
    q.querySelectorAll('.option').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        if (btn.hasAttribute('data-correct')) {
          btn.classList.add('is-correct');
          btn.disabled = true;
          const left = q.querySelectorAll('.option[data-correct]:not(.is-correct)').length;
          if (left > 0) {
            say(q, 'good', 'Correct!', left + ' more to find.');
            return;
          }
          solve(q);
          say(q, 'good', 'Correct!', explain ? explain.innerHTML : '');
        } else {
          btn.classList.add('is-wrong');
          btn.disabled = true;
          slip(q);
          say(q, 'bad', 'Not quite.', btn.dataset.feedback || 'Have another go.');
        }
      });
    });
  }

  function initMatch(q) {
    let selected = null;
    const explain = q.querySelector('.q-explain');
    const items = q.querySelectorAll('.match-item');
    const pool = q.querySelector('.match-items');
    const sorting = !!q.querySelector('.match.is-sort');
    const ordering = !!q.querySelector('.match.is-order');

    // Give every target an empty slot above it; a correctly matched item moves into that slot
    q.querySelectorAll('.match-target').forEach((target) => {
      const col = document.createElement('div');
      const slot = document.createElement('div');
      col.className = 'match-col';
      slot.className = 'match-slot';
      target.before(col);
      col.append(slot, target);
    });

    // Run a DOM change, then glide the item from where it was to where it ends up,
    // stretching from its old size to its new one
    const glides = new WeakMap();
    function glide(item, change) {
      const from = item.getBoundingClientRect();
      item.style.transform = '';
      change();
      if (reduceMotion()) return;
      const to = item.getBoundingClientRect();
      const move = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
      const scale = `scale(${from.width / to.width}, ${from.height / to.height})`;
      glides.set(item, item.animate(
        [{ transformOrigin: '0 0', transform: move + ' ' + scale }, { transformOrigin: '0 0', transform: 'none' }],
        { duration: 350, easing: EASE }
      ));
    }

    // Once every item has gone, fold the empty pool away so the names slide up
    function foldPool() {
      if (reduceMotion()) { pool.hidden = true; return; }
      const gap = parseFloat(getComputedStyle(pool.parentElement).rowGap) || 0;
      const a = resizeBox(pool, [
        { height: pool.offsetHeight + 'px', marginBottom: '0px', opacity: 1 },
        { height: '0px', marginBottom: -gap + 'px', opacity: 0 }
      ], { duration: 400, delay: 250, fill: 'both' }, true);
      a.addEventListener('finish', () => { pool.hidden = true; a.cancel(); });
    }

    function select(btn) {
      if (selected) selected.classList.remove('is-selected');
      selected = btn;
      if (btn) btn.classList.add('is-selected');
    }

    function nudge(b) {
      b.classList.remove('is-wrong');
      void b.offsetWidth; // restart the nudge animation
      b.classList.add('is-wrong');
      setTimeout(() => b.classList.remove('is-wrong'), 600);
    }

    // Shared by tapping and dragging: true if the item belongs with the target
    function tryMatch(item, target) {
      if (item.dataset.key !== target.dataset.key) {
        slip(q);
        say(q, 'bad', sorting ? 'Not in that group.' : ordering ? 'Not in that place.' : 'Not a match.', 'Try again.');
        return false;
      }
      // When sorting, a group stays open for the rest of its items
      item.classList.add('is-matched');
      item.disabled = true;
      const groupDone = ![...items].some((b) => !b.disabled && b.dataset.key === target.dataset.key);
      if (groupDone) {
        target.classList.add('is-matched');
        target.disabled = true;
      }
      // A faint outline keeps the item's place, so the rest of the pool doesn't shuffle up,
      // and the slot eases to its new height (it grows as a group fills up)
      const slot = target.previousElementSibling;
      easeHeight(slot, () => {
        glide(item, () => {
          if (item.parentElement === pool) {
            const ghost = document.createElement('div');
            ghost.className = 'match-ghost';
            ghost.style.height = item.offsetHeight + 'px';
            item.before(ghost);
          }
          slot.append(item);
        });
      });
      if (pool && !pool.querySelector('.match-item')) foldPool();
      const left = [...items].filter((b) => !b.disabled).length;
      if (left === 0) {
        solve(q);
        say(q, 'good', sorting ? 'All sorted!' : ordering ? 'All in order!' : 'All matched!', explain ? explain.innerHTML : '');
      } else {
        say(q, 'good', sorting || ordering ? 'Correct!' : 'Match!', left + ' to go.');
      }
      return true;
    }

    // Tap one, then tap its partner
    let dragged = false;
    q.querySelectorAll('.match-item, .match-target').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (dragged) { dragged = false; return; } // the click that ends a drag
        if (btn.disabled) return;
        const isItem = btn.classList.contains('match-item');
        // Tapping the same side again just changes which one is picked
        if (!selected || selected === btn || selected.classList.contains('match-item') === isItem) {
          select(selected === btn ? null : btn);
          return;
        }
        const a = selected;
        select(null);
        const [item, target] = isItem ? [btn, a] : [a, btn];
        if (!tryMatch(item, target)) [item, target].forEach(nudge);
      });
    });

    // Or drag an item onto its name. A press only becomes a drag once the finger moves,
    // so a plain tap still works as above.
    items.forEach((item) => {
      let start = null;
      let over = null;

      // The column under the finger, looking past the dragged item itself
      const colAt = (x, y) => {
        const el = document.elementsFromPoint(x, y).find((n) => !item.contains(n));
        const col = el && el.closest('.match-col');
        return col && q.contains(col) && !col.querySelector('.match-target').disabled ? col : null;
      };
      const setOver = (col) => {
        if (over) over.classList.remove('is-over');
        over = col;
        if (col) col.classList.add('is-over');
      };

      item.addEventListener('pointerdown', (e) => {
        if (item.disabled || e.button > 0) return;
        const sliding = glides.get(item);
        if (sliding) sliding.cancel(); // grabbed again while still sliding back
        start ={ x: e.clientX, y: e.clientY, id: e.pointerId, moving: false };
        // Keep receiving this pointer's moves even after it leaves the item
        item.setPointerCapture(e.pointerId);
      });

      item.addEventListener('pointermove', (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!start.moving) {
          if (Math.hypot(dx, dy) < 8) return;
          start.moving = true;
          select(null);
          item.classList.add('is-dragging');
        }
        item.style.transform = `translate(${dx}px, ${dy}px)`;
        setOver(colAt(e.clientX, e.clientY));
      });

      const end = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const wasMoving = start.moving;
        start = null;
        if (!wasMoving) return;
        dragged = true;
        setTimeout(() => { dragged = false; }, 0);
        item.classList.remove('is-dragging');
        const col = e.type === 'pointerup' ? over : null;
        setOver(null);
        const target = col && col.querySelector('.match-target');
        if (target && tryMatch(item, target)) return;
        // Not dropped on its name: slide back to where it came from
        glide(item, () => {});
        if (target) nudge(target);
      };
      item.addEventListener('pointerup', end);
      item.addEventListener('pointercancel', end);
    });
  }

  // Read a typed number, forgiving spaces, a comma for the decimal point and a unit on the end
  function readNumber(text) {
    const m = text.replace(/\s/g, '').replace(',', '.').match(/^[-+]?(\d+\.?\d*|\.\d+)/);
    return m ? Number(m[0]) : NaN;
  }

  function initInput(q) {
    const input = q.querySelector('.answer');
    const check = q.querySelector('.q-check');
    const explain = q.querySelector('.q-explain');
    const answer = Number(q.dataset.answer);
    const tol = Number(q.dataset.tol || 0.02);
    const near = (x, target) => Math.abs(x - target) <= Math.abs(target) * tol + 1e-9;

    function mark() {
      if (input.disabled) return;
      const x = readNumber(input.value);
      if (Number.isNaN(x)) {
        say(q, 'bad', 'Type a number.', 'Just the number: the unit is already there.');
        return;
      }
      if (near(x, answer)) {
        input.classList.add('is-correct');
        solve(q);
        say(q, 'good', 'Correct!', explain ? explain.innerHTML : '');
        return;
      }
      const mistake = [...q.querySelectorAll('.mistake')].find((p) => near(x, Number(p.dataset.value)));
      slip(q);
      input.classList.remove('is-wrong');
      void input.offsetWidth; // restart the nudge animation
      input.classList.add('is-wrong');
      say(q, 'bad', 'Not quite.', mistake ? mistake.innerHTML : 'Check your working and have another go.');
    }

    check.addEventListener('click', mark);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); mark(); }
    });
    input.addEventListener('input', () => input.classList.remove('is-wrong'));
  }

  function initTruth(q) {
    const cells = [...q.querySelectorAll('.truth-cell')];
    const explain = q.querySelector('.q-explain');
    const options = (q.dataset.options || '0 1').split(/\s+/);
    const [one, many] = q.dataset.options ? ['box', 'boxes'] : ['row', 'rows'];
    cells.forEach((cell) => {
      cell.addEventListener('click', () => {
        cell.textContent = options[(options.indexOf(cell.textContent) + 1) % options.length];
        cell.classList.remove('is-wrong');
      });
    });
    q.querySelector('.q-check').addEventListener('click', () => {
      if (cells.some((c) => !options.includes(c.textContent))) {
        say(q, 'bad', 'Not finished.', 'Tap every ? to fill in each ' + one + ' first.');
        return;
      }
      const wrong = cells.filter((c) => c.textContent !== c.dataset.answer);
      cells.forEach((c) => c.classList.toggle('is-wrong', wrong.includes(c)));
      if (wrong.length === 0) {
        cells.forEach((c) => c.classList.add('is-correct'));
        solve(q);
        say(q, 'good', 'Correct!', explain ? explain.innerHTML : '');
      } else {
        slip(q);
        say(q, 'bad', 'Not quite.', (wrong.length === 1 ? '1 ' + one + ' is' : wrong.length + ' ' + many + ' are') +
          ' wrong, marked "Check". Tap ' + (wrong.length === 1 ? 'it' : 'them') + ' to change.');
      }
    });
  }

  function init(q) {
    if (q.classList.contains('q-mcq')) initMcq(q);
    if (q.classList.contains('q-match')) initMatch(q);
    if (q.classList.contains('q-input')) initInput(q);
    if (q.classList.contains('q-truth')) initTruth(q);
  }

  function initTimer(el) {
    const select = el.querySelector('select');
    const display = el.querySelector('.timer-display');
    const toggle = el.querySelector('[data-timer-toggle]');
    let remaining = 0;
    let endAt = 0;
    let tick = null;

    const show = (ms) => {
      const s = Math.ceil(ms / 1000);
      display.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    };
    const stop = () => { clearInterval(tick); tick = null; toggle.textContent = 'Start'; };
    const reset = () => {
      stop();
      remaining = Number(select.value) * 60000;
      el.classList.remove('is-done');
      show(remaining);
    };

    toggle.addEventListener('click', () => {
      if (tick) {
        remaining = endAt - Date.now();
        stop();
        return;
      }
      if (remaining <= 0) reset();
      endAt = Date.now() + remaining;
      toggle.textContent = 'Pause';
      tick = setInterval(() => {
        const left = endAt - Date.now();
        if (left <= 0) {
          stop();
          remaining = 0;
          display.textContent = "Time's up!";
          el.classList.add('is-done');
        } else {
          show(left);
        }
      }, 250);
    });
    select.addEventListener('change', reset);
    reset();
  }

  document.querySelectorAll('.q').forEach((q) => {
    originals.set(q, q.innerHTML);
    init(q);
  });
  updateTopicCheck();

  document.querySelectorAll('[data-timer]').forEach(initTimer);

  const answersBtn = document.querySelector('[data-show-answers]');
  if (answersBtn) {
    answersBtn.addEventListener('click', () => {
      const on = document.body.classList.toggle('show-answers');
      answersBtn.setAttribute('aria-pressed', String(on));
      answersBtn.textContent = on ? 'Hide answers' : 'Show answers';
    });
  }

  const resetBtn = document.querySelector('[data-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      originals.forEach((html, q) => {
        q.innerHTML = html;
        q.classList.remove('is-solved');
        delete q.dataset.slipped;
        init(q);
      });
      updateTopicCheck();
      document.body.classList.remove('show-answers');
      if (answersBtn) {
        answersBtn.setAttribute('aria-pressed', 'false');
        answersBtn.textContent = 'Show answers';
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();
