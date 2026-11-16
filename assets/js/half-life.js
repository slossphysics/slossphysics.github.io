// Virtual half-life experiment. Markup: a [data-half-life] box with
//   data-half-life="25"   half-life in seconds (the same for every pupil, so the class can agree on it)
//   data-activity="800"   activity at the start, in Bq
//   data-run="120"        how long a run lasts, in seconds
//   data-step="10"        how often a reading is held on screen for pupils to write down
// and inside it: .hl-nuclei (filled with dots here), [data-hl="activity"], [data-hl="time"],
// .hl-hold with [data-hl="hold"] and [data-hl="next"], and buttons [data-hl="start"], [data-hl="reset"].
//
// The counter reading follows A = A0 x 0.5^(t / half-life) with a little random scatter (about 1.5%),
// so two pupils get slightly different numbers but the same curve. The dots are a picture of the
// nuclei: each one is given its own random moment to decay.
(function () {
  'use strict';

  const root = document.querySelector('[data-half-life]');
  if (!root) return;

  const HALF = Number(root.dataset.halfLife) || 25;
  const A0 = Number(root.dataset.activity) || 800;
  const RUN = Number(root.dataset.run) || 120;
  const STEP = Number(root.dataset.step) || 10;
  const DOTS = 240;
  const SCATTER = 0.015;

  const part = (name) => root.querySelector('[data-hl="' + name + '"]');
  const nucleiBox = root.querySelector('.hl-nuclei');
  const activityOut = part('activity');
  const timeOut = part('time');
  const holdBox = root.querySelector('.hl-hold');
  const holdOut = part('hold');
  const nextOut = part('next');
  const startBtn = part('start');
  const resetBtn = part('reset');

  const dots = [];
  for (let i = 0; i < DOTS; i++) {
    const d = document.createElement('span');
    d.className = 'hl-nucleus';
    nucleiBox.appendChild(d);
    dots.push({ el: d, at: 0, gone: false });
  }

  // A random number from a bell curve (Box-Muller), kept within 2 either way
  function bell() {
    const u = 1 - Math.random();
    const v = Math.random();
    const g = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(-2, Math.min(2, g));
  }

  function reading(t) {
    const a = A0 * Math.pow(0.5, t / HALF);
    return Math.max(0, Math.round(a * (1 + SCATTER * bell())));
  }

  let timer = null;
  let began = 0;
  let lastSecond = -1;
  let lastMark = -1;

  function shuffle() {
    dots.forEach((d) => {
      d.at = -HALF / Math.LN2 * Math.log(1 - Math.random());
      d.gone = false;
      d.el.classList.remove('is-decayed');
    });
  }

  function showDots(t) {
    dots.forEach((d) => {
      if (!d.gone && d.at <= t) {
        d.gone = true;
        d.el.classList.add('is-decayed');
      }
    });
  }

  function hold(mark, value) {
    holdOut.innerHTML = 'At ' + mark + ' s the activity was <strong>' + value + ' Bq</strong>';
    holdBox.classList.remove('is-new');
    void holdBox.offsetWidth;
    holdBox.classList.add('is-new');
  }

  function tick() {
    let t = (performance.now() - began) / 1000;
    const finished = t >= RUN;
    if (finished) t = RUN;
    const second = Math.floor(t);
    showDots(t);
    if (second !== lastSecond) {
      lastSecond = second;
      const value = reading(second);
      activityOut.textContent = value;
      timeOut.textContent = second;
      const mark = Math.floor(second / STEP) * STEP;
      if (mark !== lastMark) {
        lastMark = mark;
        hold(mark, mark === second ? value : reading(mark));
      }
      nextOut.textContent = finished ? '' : 'Next reading in ' + (STEP - (second % STEP)) + ' s';
    }
    if (finished) finish();
  }

  function finish() {
    clearInterval(timer);
    timer = null;
    startBtn.disabled = false;
    startBtn.textContent = 'Run it again';
    nextOut.textContent = 'The run has finished. If you missed a reading, run it again.';
  }

  function reset() {
    clearInterval(timer);
    timer = null;
    lastSecond = -1;
    lastMark = -1;
    shuffle();
    activityOut.textContent = reading(0);
    timeOut.textContent = '0';
    holdOut.textContent = 'Press Start, then write down each reading as it appears here.';
    nextOut.textContent = '';
    holdBox.classList.remove('is-new');
    startBtn.disabled = false;
    startBtn.textContent = 'Start';
  }

  function start() {
    reset();
    startBtn.disabled = true;
    began = performance.now();
    tick();
    timer = setInterval(tick, 100);
  }

  startBtn.addEventListener('click', start);
  resetBtn.addEventListener('click', reset);
  reset();
})();
