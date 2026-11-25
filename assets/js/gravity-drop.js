/* Gravity drop (bge/gravity-drop.html, Nov 2026, made for 1E's gravity lesson).
   Three side-by-side lanes. In each lane pupils choose an object and a place (planets, the Moon,
   Pluto, the Sun, deep space), then press Drop to race them to the ground. With the air off, objects
   in the same gravity always land together; stronger gravity makes them land sooner. With the air on,
   light things (the feather) fall slowly where there is an atmosphere.

   Markup:
     <div data-gravity-drop>
       <button data-gd-drop>  <button data-gd-reset>  <button data-gd-air aria-pressed>
       <button data-gd-slow aria-pressed>  <select data-gd-height>
       <button data-gd-preset="moon|air|apple|sun">   quick set-ups
       <div data-gd-lanes></div>                      lanes are built here
       <div data-gd-result aria-live="polite"></div>  the message after a drop
       <img data-gd-photo="earth" src="data:…">       hidden badge photos (the Google copy can't serve image files)
     </div>
   g values are the department's rounded ones (the same table as the Lesson 10 worksheet), plus
   Pluto, the Sun and deep space for fun. */
(function () {
  'use strict';

  // air: how thick the atmosphere is compared with Earth's (0 = none)
  var PLACES = [
    { k: 'earth', name: 'Earth', g: 10, air: 1 },
    { k: 'moon', name: 'The Moon', g: 2, air: 0 },
    { k: 'mercury', name: 'Mercury', g: 4, air: 0 },
    { k: 'venus', name: 'Venus', g: 9, air: 30, note: 'Very thick air' },
    { k: 'mars', name: 'Mars', g: 4, air: 0.02, note: 'Very thin air' },
    { k: 'jupiter', name: 'Jupiter', g: 23, air: 1, note: 'No solid ground: we added a floor' },
    { k: 'saturn', name: 'Saturn', g: 9, air: 1, note: 'No solid ground: we added a floor' },
    { k: 'uranus', name: 'Uranus', g: 9, air: 1, note: 'No solid ground: we added a floor' },
    { k: 'neptune', name: 'Neptune', g: 11, air: 1, note: 'No solid ground: we added a floor' },
    { k: 'pluto', name: 'Pluto', g: 0.6, air: 0 },
    { k: 'sun', name: 'The Sun', g: 274, air: 0, note: 'Far too hot to stand on: just pretend!' },
    { k: 'space', name: 'Deep space', g: 0, air: 0, note: 'Far from any planet or star' }
  ];
  // m: mass (kg); vt: speed it stops speeding up at in Earth's air (m/s); e: bounciness; s: size (px)
  var OBJECTS = [
    { k: 'hammer', name: 'Hammer', m: 1.3, vt: 45, e: 0.15, s: 58 },
    { k: 'feather', name: 'Feather', m: 0.03, vt: 1.6, e: 0, s: 50, sway: true },
    { k: 'apple', name: 'Apple', m: 0.1, vt: 30, e: 0.2, s: 40 },
    { k: 'football', name: 'Football', m: 0.45, vt: 22, e: 0.65, s: 44 },
    { k: 'ball', name: 'Bowling ball', m: 7, vt: 90, e: 0.3, s: 48 },
    { k: 'astronaut', name: 'Astronaut', m: 120, vt: 60, e: 0.05, s: 62 },
    { k: 'elephant', name: 'Elephant', m: 5000, vt: 110, e: 0.02, s: 92 }
  ];
  var SVG = {
    hammer: '<svg viewBox="0 0 100 100"><rect x="44" y="30" width="12" height="66" rx="5" fill="#a86b32" stroke="#5c3510" stroke-width="3"/><path d="M14 14h62l10 8v12H14z" fill="#9aa3ad" stroke="#3b434c" stroke-width="3" stroke-linejoin="round"/><path d="M76 14l14-6v34l-14-8" fill="#7b848e" stroke="#3b434c" stroke-width="3" stroke-linejoin="round"/></svg>',
    feather: '<svg viewBox="0 0 100 100"><path d="M18 90C30 60 52 26 86 10 82 40 60 70 26 86z" fill="#fffdf6" stroke="#8c8573" stroke-width="3" stroke-linejoin="round"/><path d="M12 96L80 18" stroke="#8c8573" stroke-width="3" stroke-linecap="round"/><path d="M40 64l-12-10M52 50l-12-12M63 37l-8-14M48 58l16 4M60 44l16 2M70 31l12 0" stroke="#c9c1ac" stroke-width="2.5" stroke-linecap="round"/></svg>',
    apple: '<svg viewBox="0 0 100 100"><path d="M50 30c-10-8-34-8-38 16-4 26 14 48 26 48 6 0 8-3 12-3s6 3 12 3c12 0 30-22 26-48-4-24-28-24-38-16z" fill="#e23b3b" stroke="#7d1414" stroke-width="3"/><path d="M50 30c0-10 2-16 6-22" stroke="#5c3510" stroke-width="4" stroke-linecap="round"/><path d="M56 16c8-8 20-8 24-4-6 8-16 10-24 4z" fill="#4caf50" stroke="#1f6b24" stroke-width="2.5"/><ellipse cx="32" cy="46" rx="6" ry="10" fill="#ff9b9b"/></svg>',
    football: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#fff" stroke="#1d1d1d" stroke-width="3"/><path d="M50 34l15 11-6 18H41l-6-18z" fill="#1d1d1d"/><path d="M50 6v28M65 45l26-8M59 63l16 24M41 63L25 87M35 45L9 37" stroke="#1d1d1d" stroke-width="3"/><path d="M38 9l12 8 12-8M88 30l-4 14 8 12M80 78l-14 2-6 12M34 92l-6-12-14-2M8 56l8-12-4-14" fill="#1d1d1d" stroke="#1d1d1d" stroke-width="3" stroke-linejoin="round"/></svg>',
    ball: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="#2c3fa8" stroke="#141d57" stroke-width="3"/><circle cx="40" cy="30" r="6" fill="#141d57"/><circle cx="56" cy="28" r="6" fill="#141d57"/><circle cx="50" cy="44" r="7" fill="#141d57"/><path d="M22 62c6 12 18 20 30 20" stroke="#6f86ff" stroke-width="4" fill="none" stroke-linecap="round"/></svg>',
    astronaut: '<svg viewBox="0 0 100 100"><rect x="24" y="36" width="12" height="34" rx="6" fill="#d9dde3" stroke="#59606b" stroke-width="3"/><rect x="30" y="34" width="40" height="40" rx="12" fill="#fff" stroke="#59606b" stroke-width="3"/><rect x="64" y="38" width="16" height="30" rx="7" fill="#fff" stroke="#59606b" stroke-width="3"/><circle cx="50" cy="24" r="18" fill="#fff" stroke="#59606b" stroke-width="3"/><path d="M38 22a12 10 0 0 1 24 0v6a12 6 0 0 1-24 0z" fill="#f4b73f" stroke="#8a5a00" stroke-width="2.5"/><rect x="34" y="72" width="13" height="22" rx="5" fill="#fff" stroke="#59606b" stroke-width="3"/><rect x="53" y="72" width="13" height="22" rx="5" fill="#fff" stroke="#59606b" stroke-width="3"/><rect x="42" y="46" width="16" height="10" rx="2" fill="#e14d43"/></svg>',
    elephant: '<svg viewBox="0 0 100 100"><ellipse cx="44" cy="56" rx="32" ry="24" fill="#9aa1a8" stroke="#4b5158" stroke-width="3"/><rect x="18" y="68" width="12" height="24" rx="5" fill="#9aa1a8" stroke="#4b5158" stroke-width="3"/><rect x="34" y="70" width="12" height="22" rx="5" fill="#9aa1a8" stroke="#4b5158" stroke-width="3"/><rect x="52" y="70" width="12" height="22" rx="5" fill="#9aa1a8" stroke="#4b5158" stroke-width="3"/><circle cx="74" cy="40" r="18" fill="#9aa1a8" stroke="#4b5158" stroke-width="3"/><path d="M88 46c6 10 6 24 0 34" stroke="#4b5158" stroke-width="10" stroke-linecap="round" fill="none"/><path d="M88 46c6 10 6 24 0 34" stroke="#9aa1a8" stroke-width="5" stroke-linecap="round" fill="none"/><path d="M64 28c-14-4-22 6-20 18 2 10 12 14 20 10" fill="#b7bdc3" stroke="#4b5158" stroke-width="3"/><circle cx="80" cy="36" r="3" fill="#1d1d1d"/><path d="M12 50c-6 2-8 8-6 12" stroke="#4b5158" stroke-width="3" fill="none" stroke-linecap="round"/></svg>'
  };
  var DEFAULT = [['hammer', 'earth'], ['feather', 'earth'], ['hammer', 'moon']];
  var PRESETS = {
    moon: { air: false, lanes: [['hammer', 'moon'], ['feather', 'moon'], ['elephant', 'moon']] },
    air: { air: true, lanes: [['hammer', 'earth'], ['feather', 'earth'], ['ball', 'earth']] },
    apple: { air: false, lanes: [['apple', 'moon'], ['apple', 'earth'], ['apple', 'jupiter']] },
    sun: { air: false, lanes: [['football', 'pluto'], ['football', 'earth'], ['football', 'sun']] }
  };
  var G_EARTH = 10, MAX_T = 60, FLOAT_T = 5;

  function find(list, k) { for (var i = 0; i < list.length; i++) if (list[i].k === k) return list[i]; return list[0]; }
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function numText(n) {
    if (n >= 1000) return Math.round(n).toLocaleString('en-GB');
    if (n >= 10) return String(Math.round(n));
    return String(Math.round(n * 100) / 100);
  }
  function secs(t) { return t.toFixed(2) + ' s'; }
  function speedText(v) { v = Math.abs(v); return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' m/s'; }
  function ord(n) { return ['1st', '2nd', '3rd', '4th'][n] || (n + 1) + 'th'; }

  document.querySelectorAll('[data-gravity-drop]').forEach(init);

  function init(root) {
    var lanesEl = root.querySelector('[data-gd-lanes]');
    var resultEl = root.querySelector('[data-gd-result]');
    var airBtn = root.querySelector('[data-gd-air]');
    var slowBtn = root.querySelector('[data-gd-slow]');
    var heightSel = root.querySelector('[data-gd-height]');
    var photos = {};
    root.querySelectorAll('img[data-gd-photo]').forEach(function (im) { photos[im.getAttribute('data-gd-photo')] = im.src; });
    var st = { air: false, slow: false, h: 20, raf: 0, last: 0, group: null };
    var lanes = DEFAULT.map(function (d, i) { return makeLane(i, d[0], d[1]); });

    function makeLane(i, objK, placeK) {
      var L = { i: i, obj: find(OBJECTS, objK), place: find(PLACES, placeK), sim: null };
      var box = L.el = el('div', 'gd-lane');
      var head = el('div', 'gd-head');
      var pRow = el('label', 'gd-pick');
      L.badge = el('span', 'gd-badge');
      L.placeSel = el('select');
      L.placeSel.setAttribute('aria-label', 'Lane ' + (i + 1) + ' place');
      PLACES.forEach(function (p) { var o = el('option', null, p.name); o.value = p.k; L.placeSel.appendChild(o); });
      pRow.appendChild(L.badge); pRow.appendChild(L.placeSel);
      L.gText = el('p', 'gd-g');
      var oRow = el('label', 'gd-pick');
      L.icon = el('span', 'gd-icon');
      L.objSel = el('select');
      L.objSel.setAttribute('aria-label', 'Lane ' + (i + 1) + ' object');
      OBJECTS.forEach(function (o) { var op = el('option', null, o.name); op.value = o.k; L.objSel.appendChild(op); });
      oRow.appendChild(L.icon); oRow.appendChild(L.objSel);
      L.massText = el('p', 'gd-mass');
      head.appendChild(pRow); head.appendChild(L.gText); head.appendChild(oRow); head.appendChild(L.massText);

      var scene = L.scene = el('div', 'gd-scene');
      scene.setAttribute('role', 'button');
      scene.setAttribute('tabindex', '0');
      L.ruler = el('div', 'gd-ruler');
      L.objEl = el('div', 'gd-obj');
      L.ground = el('div', 'gd-ground');
      L.dust = el('div', 'gd-dust');
      L.note = el('p', 'gd-note');
      L.airChip = el('span', 'gd-airchip');
      [L.ruler, L.ground, L.dust, L.objEl, L.note, L.airChip].forEach(function (c) { scene.appendChild(c); });

      var read = el('div', 'gd-read');
      L.tOut = el('span', null, 'Time <b>0.00 s</b>');
      L.vOut = el('span', null, 'Speed <b>0.0 m/s</b>');
      read.appendChild(L.tOut); read.appendChild(L.vOut);

      box.appendChild(head); box.appendChild(scene); box.appendChild(read);
      lanesEl.appendChild(box);

      L.placeSel.addEventListener('change', function () { L.place = find(PLACES, L.placeSel.value); dress(L); stop(L); });
      L.objSel.addEventListener('change', function () { L.obj = find(OBJECTS, L.objSel.value); dress(L); stop(L); });
      scene.addEventListener('click', function () { drop([L]); });
      scene.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop([L]); } });
      dress(L);
      return L;
    }

    // Show a lane's choices: scene colours, badge, text
    function dress(L) {
      var p = L.place, o = L.obj;
      L.placeSel.value = p.k; L.objSel.value = o.k;
      L.el.setAttribute('data-place', p.k);
      L.badge.innerHTML = photos[p.k] ? '<img alt="" src="' + photos[p.k] + '">' : '';
      L.gText.innerHTML = 'Gravity: <b>' + numText(p.g) + ' N/kg</b>';
      L.icon.innerHTML = SVG[o.k];
      L.objEl.innerHTML = SVG[o.k];
      L.objEl.style.width = L.objEl.style.height = o.s + 'px';
      L.massText.innerHTML = 'Mass <b>' + numText(o.m) + ' kg</b> · Weight here <b>' + numText(o.m * p.g) + ' N</b>';
      L.scene.setAttribute('aria-label', 'Drop the ' + o.name.toLowerCase() + ' on ' + p.name);
      L.note.textContent = p.note || '';
      airChip(L);
      ruler(L);
    }
    function airChip(L) {
      var on = st.air && L.place.air > 0;
      L.airChip.textContent = st.air ? (L.place.air > 0 ? 'Air' : 'No air here') : '';
      L.airChip.className = 'gd-airchip' + (st.air ? (on ? ' on' : ' none') : '');
    }
    // Geometry: where the bottom of the object is for a given distance fallen
    function geo(L) {
      var H = L.scene.clientHeight, ground = L.place.k === 'space' ? 0 : 30, top = 34;
      return { top: top, range: Math.max(40, H - ground - top - L.obj.s), ground: ground };
    }
    function ruler(L) {
      var g = geo(L), h = st.h, html = '';
      [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
        var y = g.top + L.obj.s + f * g.range;
        html += '<span style="top:' + y.toFixed(1) + 'px">' + numText(h * (1 - f)) + ' m</span>';
      });
      L.ruler.innerHTML = L.place.k === 'space' ? '' : html;
      place(L, L.sim ? L.sim.y : 0, L.sim ? L.sim.t : 0);
    }
    function place(L, y, t) {
      var g = geo(L), o = L.obj, x = 0, r = 0;
      if (o.sway && L.sim && st.air && L.place.air > 0 && !L.sim.landed) { x = Math.sin(t * 2.6) * 16; r = Math.sin(t * 2.6 + 0.6) * 24; }
      if (L.place.k === 'space' && L.sim) { x = Math.sin(t * 0.9) * 10; r = t * 14; y = -Math.sin(t * 0.7) * 0.03 * st.h; }
      L.objEl.style.transform = 'translate(calc(-50% + ' + x.toFixed(1) + 'px),' + (g.top + (y / st.h) * g.range).toFixed(1) + 'px) rotate(' + r.toFixed(1) + 'deg)';
    }
    function readout(L) {
      var s = L.sim;
      var t = s ? (s.tLand != null ? s.tLand : s.t) : 0;
      var v = s ? (s.vLand != null ? s.vLand : s.v) : 0;
      L.tOut.innerHTML = (s && s.tLand != null ? 'Landed in <b>' : 'Time <b>') + secs(t) + '</b>';
      L.vOut.innerHTML = (s && s.vLand != null ? 'Hit the ground at <b>' : 'Speed <b>') + speedText(v) + '</b>';
    }

    function stop(L) {
      L.sim = null;
      L.el.classList.remove('gd-shake', 'gd-landed');
      L.dust.className = 'gd-dust';
      place(L, 0, 0); readout(L);
      if (st.group && st.group.indexOf(L) >= 0) { st.group = null; resultEl.innerHTML = ''; }
    }

    function drop(group) {
      group.forEach(function (L) {
        stop(L);
        L.sim = { y: 0, v: 0, t: 0, tLand: null, vLand: null, landed: false, done: false, stuck: false };
      });
      st.group = group;
      resultEl.innerHTML = '';
      if (!st.raf) { st.last = 0; st.raf = requestAnimationFrame(frame); }
    }

    function step(L, dt) {
      var s = L.sim, o = L.obj, p = L.place, h = st.h;
      var k = st.air && p.air > 0 ? (G_EARTH / (o.vt * o.vt)) * p.air : 0;
      var n = Math.max(1, Math.ceil(dt / 0.002)), d = dt / n;
      for (var i = 0; i < n && !s.done; i++) {
        var a = p.g - k * s.v * Math.abs(s.v);
        s.v += a * d; s.y += s.v * d; s.t += d;
        if (s.y >= h) {
          s.y = h;
          if (!s.landed) { s.landed = true; s.tLand = s.t; s.vLand = s.v; land(L, s.v); }
          if (o.e > 0 && s.v * o.e > 0.8) s.v = -s.v * o.e;
          else { s.v = 0; s.done = true; }
        }
        if (p.g === 0 && s.t >= FLOAT_T) s.done = true;
        if (!s.landed && s.t >= MAX_T) { s.done = true; s.stuck = true; }
      }
    }
    // Landing: dust and a shake that grow with how hard it hits (its kinetic energy)
    function land(L, v) {
      var E = 0.5 * L.obj.m * v * v;
      L.el.classList.add('gd-landed');
      if (E > 1) {
        var size = Math.min(170, 24 + Math.log(E) / Math.LN10 * 20);
        L.dust.style.setProperty('--size', size.toFixed(0) + 'px');
        L.dust.className = 'gd-dust';
        void L.dust.offsetWidth;
        L.dust.className = 'gd-dust go';
      }
      if (E > 50000) {
        L.el.classList.remove('gd-shake'); void L.el.offsetWidth; L.el.classList.add('gd-shake');
      }
    }

    function frame(now) {
      var dt = st.last ? Math.min(0.05, (now - st.last) / 1000) : 0;
      st.last = now;
      if (st.slow) dt *= 0.25;
      var busy = false;
      lanes.forEach(function (L) {
        if (!L.sim) return;
        if (!L.sim.done) { step(L, dt); busy = true; }
        place(L, L.sim.y, L.sim.t);
        readout(L);
      });
      // The message comes as soon as everything has landed (bouncing can carry on)
      if (st.group && st.group.every(function (L) { return L.sim && (L.sim.done || L.sim.tLand != null); })) result(st.group);
      if (busy) st.raf = requestAnimationFrame(frame);
      else st.raf = 0;
    }

    // ---------- the message after a drop ----------
    function result(group) {
      st.group = null;
      var lines = [];
      var fell = group.filter(function (L) { return L.sim && L.sim.tLand != null; });
      var floaters = group.filter(function (L) { return L.place.g === 0; });
      var stuck = group.filter(function (L) { return L.sim && L.sim.stuck; });
      var pn = function (p, start) { return start ? p.name : p.name.replace(/^The /, 'the ').replace(/^Deep/, 'deep'); };
      var label = function (L) { return L.obj.name.toLowerCase() + (L.place.k === 'space' ? ' in ' : ' on ') + pn(L.place); };
      var same = function (a, b) { return Math.abs(a.sim.tLand - b.sim.tLand) < 0.015; };

      if (group.length === 1) {
        var L = group[0];
        if (fell.length) lines.push('The ' + label(L) + ' landed in ' + secs(L.sim.tLand) + ', going at ' + speedText(L.sim.vLand) + '.');
      } else if (fell.length > 1) {
        var sorted = fell.slice().sort(function (a, b) { return a.sim.tLand - b.sim.tLand; });
        var parts = [], pos = 0;
        sorted.forEach(function (L, j) {
          if (j > 0 && !same(L, sorted[j - 1])) pos = j;
          var joint = sorted.some(function (M) { return M !== L && same(M, L); });
          parts.push('<b>' + (joint ? 'Joint ' + ord(pos) : ord(pos).charAt(0).toUpperCase() + ord(pos).slice(1)) + ':</b> ' + label(L) + ' (' + secs(L.sim.tLand) + ')');
        });
        lines.push(parts.join(' &nbsp;·&nbsp; '));

        var places = {}, airSlowed = false;
        fell.forEach(function (L) { (places[L.place.k] = places[L.place.k] || []).push(L); });
        var keys = Object.keys(places);
        keys.forEach(function (k) {
          var ls = places[k];
          if (ls.length < 2) return;
          var together = ls.every(function (M) { return same(M, ls[0]); });
          var objs = ls.map(function (M) { return M.obj.k; }).filter(function (v, j, a) { return a.indexOf(v) === j; });
          var where = pn(ls[0].place);
          if (together && objs.length > 1) lines.push('<strong>Same gravity, same time.</strong> On ' + where + ' they landed together, even though their masses are very different. Gravity makes everything fall at the same rate.');
          else if (together) lines.push('Same object, same gravity: of course they landed together. Try different objects!');
          else { airSlowed = true; }
        });
        if (airSlowed) lines.push('<strong>The air did that.</strong> Air slows light things like the feather. Turn the air off and drop them again.');
        if (keys.length > 1) {
          var byG = fell.slice().sort(function (a, b) { return b.place.g - a.place.g; });
          var hi = byG[0], lo = byG[byG.length - 1];
          if (hi.place.g !== lo.place.g) lines.push('<strong>Stronger gravity pulls things down faster.</strong> ' + pn(hi.place, true) + ' (' + numText(hi.place.g) + ' N/kg) beat ' + pn(lo.place) + ' (' + numText(lo.place.g) + ' N/kg).');
        }
      } else if (fell.length === 1 && group.length > 1) {
        lines.push('The ' + label(fell[0]) + ' landed in ' + secs(fell[0].sim.tLand) + '.');
      }
      if (fell.some(function (L) { return L.place.k === 'sun'; })) lines.push('The Sun has the strongest gravity of all: things hit it in well under a second (if they didn\'t melt first!).');
      if (floaters.length) lines.push('The ' + floaters.map(function (L) { return L.obj.name.toLowerCase(); }).join(' and the ') + ' in deep space didn\'t fall at all: far from any planet or star there is almost no gravity. Its mass is still the same.');
      if (stuck.length) lines.push('The ' + stuck.map(label).join(' and the ') + ' was still floating down after a minute. Thick air!');
      resultEl.innerHTML = lines.map(function (t) { return '<p>' + t + '</p>'; }).join('');
    }

    // ---------- toolbar ----------
    root.querySelector('[data-gd-drop]').addEventListener('click', function () { drop(lanes.slice()); });
    root.querySelector('[data-gd-reset]').addEventListener('click', function () { lanes.forEach(stop); resultEl.innerHTML = ''; });
    function setAir(on) {
      st.air = on; airBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      airBtn.textContent = on ? 'Air: on' : 'Air: off';
      lanes.forEach(airChip);
    }
    airBtn.addEventListener('click', function () { setAir(!st.air); lanes.forEach(stop); resultEl.innerHTML = ''; });
    slowBtn.addEventListener('click', function () { st.slow = !st.slow; slowBtn.setAttribute('aria-pressed', st.slow ? 'true' : 'false'); });
    heightSel.addEventListener('change', function () { st.h = +heightSel.value || 20; lanes.forEach(function (L) { stop(L); ruler(L); }); resultEl.innerHTML = ''; });
    root.querySelectorAll('[data-gd-preset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = PRESETS[b.getAttribute('data-gd-preset')]; if (!p) return;
        setAir(p.air);
        p.lanes.forEach(function (d, i) { var L = lanes[i]; L.obj = find(OBJECTS, d[0]); L.place = find(PLACES, d[1]); dress(L); stop(L); });
        resultEl.innerHTML = '';
        root.querySelector('[data-gd-lanes]').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
    st.h = +heightSel.value || 20;
    setAir(false);
    window.addEventListener('resize', function () { lanes.forEach(ruler); });
    lanes.forEach(ruler);
  }
})();
