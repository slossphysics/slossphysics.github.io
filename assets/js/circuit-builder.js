// Circuit builder: pupils drag components onto a dotted grid, join them with wires that only
// run along the grid (so every corner is a right angle), and see what happens: lamps light,
// meters give readings, and moving dots show the current splitting at junctions.
//
// Markup (see bge/circuit-builder.html and n5/circuit-builder.html):
//   [data-circuit-builder]   wrapper for one builder. Optional attributes:
//       data-key="…"         localStorage key, so each level's builder keeps its own circuit
//       data-adjust="…"      component types whose value pupils can change (resistor battery fuse capacitor)
//       data-prefixes        show small currents in mA and big resistances in kΩ
//     .cb-task[data-check]   one task each; the builder ticks it off when the circuit does the job.
//                            Each has a .q-feedback, an optional .hint and a .q-explain (the answer).
//     .cb-palette button[data-type]   one button per component; optional data-value sets its starting value
//     .cb-board              the <svg> grid
// The Light, Temperature and Sound sliders are added here, for pages whose palette needs them.
// A builder with data-guided (and no palette or tasks) is a locked walkthrough board: nothing is
// saved, a tap on a part fires a "cb:tap" event, and circuit-walkthroughs.js drives it through
// root.cbApi (load a circuit, set sliders and values, pick out parts, add labels, read the results).
// Needs circuit-symbols.js for the symbols, and works alongside starter.js (timer, Show answers, Reset).
(function () {
  'use strict';

  // Every builder on the page gets its own copy of everything below (the walkthrough board is a second one)
  document.querySelectorAll('[data-circuit-builder]').forEach((root, n) => initBuilder(root, n));

  function initBuilder(root, n) {

    // ---------- Grid ----------
    const S = 40;                       // grid spacing in SVG units
    const COLS = 19;                    // grid points across (x = 0 … 18)
    const ROWS = 11;                    // grid points down (y = 0 … 10)
    const at = (i) => S / 2 + i * S;    // grid index to SVG coordinate
    const pk = (x, y) => x + ',' + y;
    const unpk = (k) => k.split(',').map(Number);
    // A wire is stored as unit-length edges between neighbouring grid points
    const ek = (x1, y1, x2, y2) =>
      x1 < x2 || (x1 === x2 && y1 < y2) ? pk(x1, y1) + '|' + pk(x2, y2) : pk(x2, y2) + '|' + pk(x1, y1);
    const ends = (e) => e.split('|').map(unpk);

    // ---------- Components and how they behave electrically ----------
    // Sources are an EMF with an internal resistance. Values are chosen so readings are tidy:
    // one lamp on one cell takes 0.30 A.
    const OHMS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200, 220, 300,
      470, 500, 1000, 2000, 2200, 4700, 5000, 10000];
    const TYPES = {
      cell:      { name: 'Cell', emf: 1.5, r: 0.01 },
      battery:   { name: 'Battery', emf: 3, r: 0.02, unit: 'V', choices: [3, 4.5, 6, 9, 12] },
      'solar-cell': { name: 'Solar cell', emf: 1.5, r: 2 },       // EMF goes up with the light level
      microphone: { name: 'Microphone', emf: 0.5, r: 10 },        // gives AC when there is sound
      lamp:      { name: 'Lamp', R: 5 },
      switch:    { name: 'Switch' },
      resistor:  { name: 'Resistor', R: 10, unit: 'Ω', choices: OHMS },
      'variable-resistor': { name: 'Variable resistor', R: 1000, unit: 'Ω',
        slider: [0, 10, 20, 50, 100, 150, 220, 330, 470, 680, 1000, 1500, 2200, 3300, 4700, 6800, 10000] },
      ldr:       { name: 'LDR' },
      thermistor: { name: 'Thermistor' },
      motor:     { name: 'Motor', R: 5, letter: 'M' },
      loudspeaker: { name: 'Loudspeaker', R: 8 },
      led:       { name: 'LED', vf: 1.2, ron: 2 },   // only conducts once it has vf, one way round
      diode:     { name: 'Diode', vf: 0.7, ron: 0.5 },
      fuse:      { name: 'Fuse', value: 3, unit: 'A', choices: [0.5, 1, 2, 3, 5, 13] },
      capacitor: { name: 'Capacitor', value: 2200, unit: 'µF', choices: [100, 470, 1000, 2200, 4700] },
      ammeter:   { name: 'Ammeter', R: 0.001, letter: 'A' },
      voltmeter: { name: 'Voltmeter', R: 1e7, letter: 'V' },
      ohmmeter:  { name: 'Ohmmeter', R: 1e7, letter: 'Ω' },
      // Transistors switch on once the base–emitter (gate–source) voltage reaches vth. The base and
      // gate are treated as taking no current, as in the SQA "transistor as a switch" model.
      npn:       { name: 'npn transistor', vth: 0.7, geom: 'transistor' },
      mosfet:    { name: 'MOSFET', vth: 2.0, geom: 'transistor' },
      relay:     { name: 'Relay', geom: 'relay' },
      // For the walkthroughs: supply rails drawn as two terminals, as exam papers do (pin 0 is +),
      // mains a.c. and a heating element for the relay circuit
      rails:     { name: 'Supply', emf: 5, r: 0.01, geom: 'rails' },
      'ac-supply': { name: 'a.c. supply', emf: 230, r: 0.5 },   // reverses every second, so the dots go back and forth
      heater:    { name: 'Heating element', R: 26 },              // about 2 kW on 230 V
    };
    const SWITCH_R = 1e-4;
    const TRANSISTOR_R = 0.1;           // collector–emitter (drain–source) when switched on
    const FUSE_R = 0.01;
    const COIL_R = 50;                  // relay coil
    const COIL_ON = 0.02;               // relay closes with more current (A) than this in its coil
    const LAMP_FULL = 0.3 * 0.3 * 5;    // power (W) of one lamp on one cell = "normal" brightness
    const WORKING = 0.05;               // lamps and motors carrying more current (A) than this are on
    const SHORT_R = 0.3;                // a cell or battery whose circuit has less resistance than this is shorted
    const TEST_V = 0.1;                 // an ohmmeter measures by pushing a small current from this voltage
    const DT = 0.05;                    // time step (s) for capacitors charging and microphone AC
    const MIC_HZ = 0.5;                 // slowed right down so the dots can be seen going back and forth
    const LDR_R = (light) => 50 * Math.pow(200, 1 - light / 100);        // 10 kΩ dark … 50 Ω bright
    const THERMISTOR_R = (temp) => 10000 * Math.pow(200, -temp / 100);   // 10 kΩ at 0 °C … 50 Ω at 100 °C

    // Where each kind of component's connections (pins) and body sit, as grid steps from its
    // centre before turning. `box` and `anchor` place its symbol (in symbol units, 30 = one grid
    // step), `sel` is the outline drawn round it, and `branches` are the pin pairs current flows between.
    const GEOMS = {
      two: { pins: [[-1, 0], [1, 0]], body: [[0, 0]], box: [0, 0, 60, 40], anchor: [30, 20],
        sel: [-1.15, -0.6, 1.15, 0.6], branches: [[0, 1]] },
      // Base (gate), collector (drain), emitter (source). Turning flips it, so the collector stays at the top.
      transistor: { pins: [[-1, 0], [0, -1], [0, 1]], body: [[0, 0]], box: [0, 0, 60, 60], anchor: [30, 30],
        sel: [-1.15, -1.15, 0.55, 1.15], branches: [[1, 2]], flips: true },
      // Switch contacts along the top, coil along the bottom. Branch 0 is the coil, branch 1 the contacts.
      // Two terminals four grid steps above and below the centre, with nothing drawn between them
      rails: { pins: [[0, -4], [0, 4]], body: [[0, -4], [0, 4]], box: [0, 0, 60, 40], anchor: [30, 20],
        sel: [-0.5, -4.5, 0.5, 4.5], branches: [[0, 1]] },
      relay: { pins: [[-1, -1], [1, -1], [-1, 1], [1, 1]], body: [[0, -1], [0, 0], [0, 1]], box: [0, -15, 60, 90],
        anchor: [30, 30], sel: [-1.15, -1.6, 1.15, 1.5], branches: [[2, 3], [0, 1]] },
    };
    const geom = (c) => GEOMS[TYPES[c.type].geom || 'two'];

    // A grid step from the component's centre, after flipping and turning it
    function place(c, p) {
      let [dx, dy] = p;
      if (c.flip) dx = -dx;
      for (let k = 0; k < c.rot; k++) [dx, dy] = [-dy, dx];
      return [c.x + dx, c.y + dy];
    }
    // For cells and the battery, pin 0 is positive (the long plate); for diodes and the LED,
    // current can only go in at pin 0.
    const pinsOf = (c) => geom(c).pins.map((p) => place(c, p));
    const bodyOf = (c) => geom(c).body.map((p) => place(c, p));

    function val(c) {
      if (c.value != null) return c.value;
      const t = TYPES[c.type];
      return t.value != null ? t.value : t.emf != null ? t.emf : t.R;
    }
    const ADJUST = new Set((root.dataset.adjust || '').split(/\s+/).filter(Boolean));
    const PREFIX = root.hasAttribute('data-prefixes');
    const fromPalette = {};
    root.querySelectorAll('.cb-palette [data-value]').forEach((b) => { fromPalette[b.dataset.type] = +b.dataset.value; });
    const newComp = (type, x, y) =>
      Object.assign({ id: 'new', type, x, y, rot: 0, closed: false }, type in fromPalette ? { value: fromPalette[type] } : {});

    // ---------- State ----------
    const KEY = root.dataset.key || 'circuit-builder-v1';
    const ENV_START = { light: 80, temp: 20, sound: 0 };
    // Guided (walkthrough) boards are locked: the walkthrough loads each circuit and nothing is saved
    const GUIDED = root.hasAttribute('data-guided');
    let state = { comps: [], wires: [], next: 1 };
    let env = Object.assign({}, ENV_START);
    let solved = new Set();
    let task = 0;
    let history = [];
    let sel = null;        // { comp: id } or { wire: Set of edge keys }
    let pending = null;    // [x, y]: start of a wire drawn by tapping
    let drag = null;       // the drag in progress on the board
    let preview = null;    // { comp, bad } or { wire: edges, bad } drawn on top while dragging
    let showFlow = true;
    const capV = new Map(); // capacitor id → voltage across it (not saved: capacitors start empty)
    let clock = 0;          // seconds of simulated time, for the microphone's AC
    let focus = new Set();  // walkthrough: components to pick out
    let dimOthers = true;   // walkthrough: fade everything else
    let annotate = null;    // walkthrough: function giving extra labels to draw
    const listeners = [];   // walkthrough: told after every change

    if (!GUIDED) try {
      const saved = JSON.parse(localStorage.getItem(KEY));
      if (saved && saved.state) {
        state = saved.state;
        // Drop any component this page doesn't know (saved by an older version)
        state.comps = state.comps.filter((c) => TYPES[c.type]);
        solved = new Set(saved.solved || []);
        task = saved.task || 0;
        if (saved.env) env = Object.assign(env, saved.env);
      }
    } catch (e) { /* storage blocked: start empty */ }

    function save() {
      if (GUIDED) return;
      try { localStorage.setItem(KEY, JSON.stringify({ state, solved: [...solved], task, env })); } catch (e) { /* ignore */ }
    }

    const clone = (st) => JSON.parse(JSON.stringify(st));
    function commit(change) {
      history.push(clone(state));
      if (history.length > 60) history.shift();
      change();
      save();
      update();
    }

    // ---------- Layout rules ----------
    const inGrid = ([x, y]) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    const same = (a, b) => a[0] === b[0] && a[1] === b[1];
    const has = (list, p) => list.some((q) => same(p, q));

    // A component's body is under its symbol, so no wire or other component may use it
    function midSet(st) {
      const s = new Set();
      st.comps.forEach((c) => bodyOf(c).forEach((p) => s.add(pk(...p))));
      return s;
    }

    function canPlace(st, c) {
      const pins = pinsOf(c), body = bodyOf(c);
      if (!pins.concat(body).every(inGrid)) return false;
      for (const o of st.comps) {
        if (o.id === c.id) continue;
        const op = pinsOf(o), ob = bodyOf(o);
        if (body.some((p) => has(ob, p) || has(op, p))) return false;
        if (ob.some((p) => has(pins, p))) return false;
      }
      const mids = new Set(body.map((p) => pk(...p)));
      return !st.wires.some((e) => e.split('|').some((p) => mids.has(p)));
    }

    // Dropped onto a straight bit of wire: the component takes the place of the two edges under
    // it, turned to line up with the wire, so it is joined in without rewiring.
    // Returns { comp, cut } or null if it doesn't fit there. Two-pin components only.
    function spliceInto(st, c) {
      if (geom(c) !== GEOMS.two) return null;
      const mid = pk(c.x, c.y);
      const touching = st.wires.filter((e) => e.split('|').includes(mid));
      if (touching.length !== 2) return null;   // no wire here, a corner end, or a junction
      for (const rot of [c.rot, (c.rot + 1) % 4]) {
        const t = Object.assign({}, c, { rot });
        const cut = pinsOf(t).map(([x, y]) => ek(x, y, c.x, c.y));
        if (!cut.every((e) => touching.includes(e))) continue;
        const rest = Object.assign({}, st, { wires: st.wires.filter((e) => !cut.includes(e)) });
        if (canPlace(rest, t)) return { comp: t, cut };
      }
      return null;
    }

    // Where a dragged component would go: a clear spot, or spliced into a wire
    function placement(st, c) {
      if (canPlace(st, c)) return { comp: c, bad: false };
      const s = spliceInto(st, c);
      return s ? { comp: s.comp, cut: s.cut, bad: false } : { comp: c, bad: true };
    }
    const SPLICE_MSG = 'Let go to join it into the wire.';

    // Edges along a path that goes straight, or turns one right-angled corner
    function route(p, q, horizontalFirst) {
      const corner = horizontalFirst ? [q[0], p[1]] : [p[0], q[1]];
      const edges = [];
      const walk = (from, to) => {
        let [x, y] = from;
        while (x !== to[0] || y !== to[1]) {
          const nx = x + Math.sign(to[0] - x);
          const ny = nx === x ? y + Math.sign(to[1] - y) : y;
          edges.push(ek(x, y, nx, ny));
          [x, y] = [nx, ny];
        }
      };
      walk(p, corner);
      walk(corner, q);
      return edges;
    }

    function wireOk(st, edges) {
      const mids = midSet(st);
      return edges.length > 0 && edges.every((e) => !e.split('|').some((p) => mids.has(p)));
    }

    // Try the preferred corner first, then the other one
    function bestRoute(st, p, q, horizontalFirst) {
      const a = route(p, q, horizontalFirst);
      if (wireOk(st, a)) return { edges: a, ok: true };
      const b = route(p, q, !horizontalFirst);
      if (wireOk(st, b)) return { edges: b, ok: true };
      return { edges: a, ok: false };
    }

    // ---------- Simulation ----------
    // Wires join grid points into "nets" (one voltage each). Every component is one or more
    // branches between two nets: current a→b inside it is I = G (Va − Vb − E). Solved with nodal analysis.
    function netsOf(st) {
      const parent = new Map();
      const find = (k) => {
        if (!parent.has(k)) parent.set(k, k);
        while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); }
        return k;
      };
      st.wires.forEach((e) => {
        const [p, q] = e.split('|');
        const a = find(p), b = find(q);
        if (a !== b) parent.set(a, b);
      });
      return find;
    }

    function gauss(A, b) {
      const n = b.length;
      for (let k = 0; k < n; k++) {
        let p = k;
        for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
        [A[k], A[p]] = [A[p], A[k]];
        [b[k], b[p]] = [b[p], b[k]];
        const piv = A[k][k] || 1e-30;
        for (let i = k + 1; i < n; i++) {
          const f = A[i][k] / piv;
          if (!f) continue;
          for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
          b[i] -= f * b[k];
        }
      }
      const x = new Array(n).fill(0);
      for (let i = n - 1; i >= 0; i--) {
        let s = b[i];
        for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
        x[i] = s / (A[i][i] || 1e-30);
      }
      return x;
    }

    function emfOf(c, light, sound) {
      if (c.type === 'solar-cell') return TYPES[c.type].emf * light / 100;
      if (c.type === 'microphone') return TYPES[c.type].emf * (sound / 100) * Math.sin(2 * Math.PI * MIC_HZ * clock);
      if (c.type === 'ac-supply') return val(c) * (Math.sin(2 * Math.PI * MIC_HZ * clock) < 0 ? -1 : 1);
      return val(c);
    }
    function resistance(c, light, temp) {
      if (c.type === 'ldr') return LDR_R(light);
      if (c.type === 'thermistor') return THERMISTOR_R(temp);
      return c.type === 'resistor' || c.type === 'variable-resistor' ? val(c) : TYPES[c.type].R;
    }

    // opts.removed: ids treated as taken out; opts.switches: Map id → closed, overriding the board;
    // opts.light / temp / sound override the sliders; opts.capZero treats capacitors as empty;
    // opts.test: id of an ohmmeter measuring (supplies off, the ohmmeter pushes a test current).
    function solve(st, opts = {}) {
      const removed = opts.removed || new Set();
      const switches = opts.switches || new Map();
      const light = 'light' in opts ? opts.light : env.light;
      const temp = 'temp' in opts ? opts.temp : env.temp;
      const sound = 'sound' in opts ? opts.sound : env.sound;
      const test = opts.test;
      const find = netsOf(st);
      const index = new Map();
      const node = (p) => {
        const r = find(pk(p[0], p[1]));
        if (!index.has(r)) index.set(r, index.size);
        return index.get(r);
      };
      const els = [];
      const parts = new Map();
      st.comps.forEach((c) => {
        if (removed.has(c.id)) return;
        const pins = pinsOf(c);
        const nodes = pins.map(node);
        const list = geom(c).branches.map(([i, j], k) =>
          ({ c, k, pa: pins[i], pb: pins[j], a: nodes[i], b: nodes[j], G: 0, E: 0 }));
        const el = list[0];
        const t = TYPES[c.type];
        if (t.emf) { el.G = 1 / t.r; el.E = test ? 0 : emfOf(c, light, sound); }
        else if (c.type === 'switch') {
          const closed = switches.has(c.id) ? switches.get(c.id) : c.closed;
          el.G = closed ? 1 / SWITCH_R : 0;
        } else if (c.type === 'fuse') el.G = c.blown ? 0 : 1 / FUSE_R;
        else if (t.vf) { el.diode = t; el.on = false; }
        else if (t.vth) { el.gate = [nodes[0], nodes[2]]; el.vth = t.vth; el.ron = TRANSISTOR_R; el.on = false; }
        else if (c.type === 'relay') {
          el.G = 1 / COIL_R;
          Object.assign(list[1], { coil: el, ron: SWITCH_R, on: false });
        } else if (c.type === 'capacitor') {
          el.G = test ? 0 : (val(c) * 1e-6) / DT;
          el.E = opts.capZero ? 0 : capV.get(c.id) || 0;
        } else if (c.id === test) { el.G = 1e6; el.E = TEST_V; }
        else el.G = 1 / Math.max(1e-3, resistance(c, light, temp));
        list.forEach((e) => els.push(e));
        parts.set(c.id, list);
      });

      const n = index.size;
      let V = new Array(n).fill(0);
      // Diodes, transistors and relays: guess which are on, solve, fix the guesses, repeat until nothing changes
      for (let round = 0; round < 30; round++) {
        els.forEach((el) => {
          if (el.diode) { el.G = el.on ? 1 / el.diode.ron : 1e-9; el.E = el.on ? el.diode.vf : 0; }
          else if (el.gate || el.coil) el.G = el.on ? 1 / el.ron : 0;
        });
        const A = Array.from({ length: n }, () => new Array(n).fill(0));
        const rhs = new Array(n).fill(0);
        for (let i = 0; i < n; i++) A[i][i] = 1e-9; // keeps unconnected parts solvable
        els.forEach(({ a, b, G, E }) => {
          if (!G || a === b) return;
          A[a][a] += G; A[b][b] += G; A[a][b] -= G; A[b][a] -= G;
          rhs[a] += G * E; rhs[b] -= G * E;
        });
        V = n ? gauss(A, rhs) : [];
        let changed = false;
        const flip = (el, on) => { if (on !== el.on) { el.on = on; changed = true; } };
        els.forEach((el) => {
          if (el.diode) {
            const dv = V[el.a] - V[el.b];
            if (el.on && dv < el.diode.vf) flip(el, false);
            else if (!el.on && dv > el.diode.vf + 1e-6) flip(el, true);
          } else if (el.gate) flip(el, V[el.gate[0]] - V[el.gate[1]] >= el.vth);
          else if (el.coil) {
            const k = el.coil;
            flip(el, Math.abs(k.G * (V[k.a] - V[k.b] - k.E)) > COIL_ON);
          }
        });
        if (!changed) break;
      }

      const byId = new Map();
      els.forEach((el) => {
        // A cell whose two ends are joined by bare wire gets its full short-circuit current
        el.I = el.G * (V[el.a] - V[el.b] - el.E);
        el.V = V[el.a] - V[el.b];
        if (el.k === 0) byId.set(el.c.id, el);
      });
      const res = { els, byId, parts, find, ohm: new Map() };

      // Ohmmeters: no reading if a supply is pushing a voltage across them; otherwise measure
      if (test == null) {
        st.comps.forEach((c) => {
          if (c.type !== 'ohmmeter' || removed.has(c.id)) return;
          if (Math.abs(byId.get(c.id).V) > 0.005) { res.ohm.set(c.id, { show: 'Error', error: true }); return; }
          const t = solve(st, Object.assign({}, opts, { test: c.id }));
          const I = Math.abs(t.byId.get(c.id).I);
          if (I < TEST_V / 1e6) { res.ohm.set(c.id, { show: 'OL', test: t }); return; }
          const R = Math.max(0, TEST_V / I - 1e-6);
          res.ohm.set(c.id, { R, show: fmtR(R), test: t });
        });
      }
      return res;
    }

    const current = (res, id) => (res.byId.has(id) ? Math.abs(res.byId.get(id).I) : 0);
    function working(res, id) {
      const el = res.byId.get(id);
      if (!el) return false;
      if (el.diode) return el.on && Math.abs(el.I) > 0.002;
      return Math.abs(el.I) > WORKING;
    }

    // How the current shares out along the wires inside each net (for the moving dots). Wires are
    // treated as equal small resistances; component currents go in and out at their ends.
    // What the walkthroughs read from a solved circuit: voltages, currents and resistances by id,
    // and whether a part is on (a transistor switched on, a relay closed, an output working)
    function reader(res, opts = {}) {
      const light = 'light' in opts ? opts.light : env.light;
      const temp = 'temp' in opts ? opts.temp : env.temp;
      const comp = (id) => state.comps.find((c) => c.id === id);
      return {
        V: (id) => (res.byId.has(id) ? Math.abs(res.byId.get(id).V) : 0),
        I: (id) => current(res, id),
        R: (id) => (comp(id) ? resistance(comp(id), light, temp) : 0),
        closed: (id) => !!(comp(id) && comp(id).closed),
        on: (id) => {
          const list = res.parts.get(id);
          if (!list) return false;
          if (list[0].gate) return list[0].on;
          if (comp(id).type === 'relay') return list[1].on;
          return working(res, id);
        },
        env: { light, temp },
      };
    }

    function wireFlows(st, res) {
      const groups = new Map();
      st.wires.forEach((e) => {
        const r = res.find(e.split('|')[0]);
        if (!groups.has(r)) groups.set(r, []);
        groups.get(r).push(e);
      });
      const inject = new Map();
      res.els.forEach((el) => {
        const ka = pk(...el.pa), kb = pk(...el.pb);
        inject.set(ka, (inject.get(ka) || 0) - el.I);
        inject.set(kb, (inject.get(kb) || 0) + el.I);
      });
      const flows = new Map();
      groups.forEach((edges) => {
        const idx = new Map();
        edges.forEach((e) => e.split('|').forEach((p) => { if (!idx.has(p)) idx.set(p, idx.size); }));
        const n = idx.size;
        const A = Array.from({ length: n }, () => new Array(n).fill(0));
        const b = new Array(n).fill(0);
        edges.forEach((e) => {
          const [p, q] = e.split('|').map((k) => idx.get(k));
          A[p][p] += 1; A[q][q] += 1; A[p][q] -= 1; A[q][p] -= 1;
        });
        idx.forEach((i, k) => { b[i] = inject.get(k) || 0; });
        A[0] = new Array(n).fill(0); A[0][0] = 1; b[0] = 0; // fix one point's level
        const phi = gauss(A, b);
        edges.forEach((e) => {
          const [p, q] = e.split('|').map((k) => idx.get(k));
          flows.set(e, phi[p] - phi[q]);
        });
      });
      return flows;
    }

    // ---------- Task checks ----------
    const ofType = (st, type) => st.comps.filter((c) => c.type === type);
    const without = (st, ids, opts) => solve(st, Object.assign({}, opts, { removed: new Set(ids) }));
    const pairs = (list) => list.flatMap((a, i) => list.slice(i + 1).map((b) => [a, b]));
    const close = (a, b, frac) => Math.abs(a - b) <= Math.abs(b) * frac;

    // Two working lamps where taking either out puts the other out too
    function seriesPair(st, res) {
      const lit = ofType(st, 'lamp').filter((c) => working(res, c.id));
      return pairs(lit).some(([a, b]) =>
        !working(without(st, [a.id]), b.id) && !working(without(st, [b.id]), a.id));
    }
    // Two working lamps where each keeps going when the other is taken out
    function parallelPairs(st, res) {
      const lit = ofType(st, 'lamp').filter((c) => working(res, c.id));
      return pairs(lit).filter(([a, b]) =>
        working(without(st, [a.id]), b.id) && working(without(st, [b.id]), a.id));
    }
    // A meter joined across a component: its two ends are on the same nets as the component's
    function across(res, m, c) {
      const a = res.byId.get(m.id), b = res.byId.get(c.id);
      return !!a && !!b && ((a.a === b.a && a.b === b.b) || (a.a === b.b && a.b === b.a));
    }
    // Resistors that the ohmmeter's test current passes through
    const tested = (st, o) => ofType(st, 'resistor').filter((r) => current(o.test, r.id) > 1e-6);
    // An output that is on at one slider setting and off at the other, and needs the transistor to work
    function autoSwitch(st, key, onAt, offAt, outputs, trType) {
      const on = solve(st, { [key]: onAt }), off = solve(st, { [key]: offAt });
      const trs = ofType(st, trType);
      return st.comps.some((o) => outputs.includes(o.type) && working(on, o.id) && !working(off, o.id) &&
        trs.some((t) => !working(without(st, [t.id], { [key]: onAt }), o.id)));
    }

    const CHECKS = {
      'one-lamp': (st, res) => ofType(st, 'lamp').some((c) => working(res, c.id)),

      // Only once the pupil has closed the switch and seen the lamp come on
      'switch-lamp': (st, res) => ofType(st, 'switch').some((s) => {
        if (!s.closed) return false;
        const off = solve(st, { switches: new Map([[s.id, false]]) });
        return ofType(st, 'lamp').some((l) => working(res, l.id) && !working(off, l.id));
      }),

      series: (st, res) => seriesPair(st, res),

      parallel: (st, res) => parallelPairs(st, res).length > 0,

      // A voltmeter joined across a working lamp
      voltage: (st, res) => ofType(st, 'voltmeter').some((v) =>
        Math.abs(res.byId.get(v.id).V) > 0.1 && ofType(st, 'lamp').some((l) => working(res, l.id) && across(res, v, l))),

      // Parallel lamps, an ammeter in each branch, and one ammeter for the total
      'current-split': (st, res) => {
        const meters = ofType(st, 'ammeter').filter((m) => current(res, m.id) > WORKING);
        return parallelPairs(st, res).some(([l1, l2]) => {
          const role = (m) => {
            const r = without(st, [m.id]);
            return (working(r, l1.id) ? 0 : 1) + (working(r, l2.id) ? 0 : 2);
          };
          const roles = meters.map(role);
          const total = meters.filter((m, i) => roles[i] === 3);
          return roles.includes(1) && roles.includes(2) && total.some((m) =>
            Math.abs(current(res, m.id) - current(res, l1.id) - current(res, l2.id)) < 0.02);
        });
      },

      // Two lamps, each with its own switch that turns off that lamp only
      'two-switches': (st) => {
        const sw = ofType(st, 'switch');
        const lamps = ofType(st, 'lamp');
        return pairs(sw).some(([s1, s2]) => {
          if (!s1.closed || !s2.closed) return false;
          const set = (a, b) => solve(st, { switches: new Map([[s1.id, a], [s2.id, b]]) });
          const both = set(true, true), open1 = set(false, true), open2 = set(true, false);
          return lamps.some((l1) => lamps.some((l2) => l1 !== l2 &&
            working(both, l1.id) && working(both, l2.id) &&
            !working(open1, l1.id) && working(open1, l2.id) &&
            working(open2, l1.id) && !working(open2, l2.id)));
        });
      },

      // An ohmmeter reading the sum of two or more resistors that all carry the same test current
      'series-resistance': (st, res) => ofType(st, 'ohmmeter').some((m) => {
        const o = res.ohm.get(m.id);
        if (!o || o.R == null) return false;
        const used = tested(st, o);
        if (used.length < 2) return false;
        const I0 = current(o.test, used[0].id);
        return used.every((r) => close(current(o.test, r.id), I0, 0.01)) &&
          close(o.R, used.reduce((s, r) => s + val(r), 0), 0.01);
      }),

      // An ohmmeter across two or more resistors that each have the full test voltage across them
      'parallel-resistance': (st, res) => ofType(st, 'ohmmeter').some((m) => {
        const o = res.ohm.get(m.id);
        if (!o || o.R == null) return false;
        const used = tested(st, o);
        return used.length >= 2 && used.every((r) => close(Math.abs(o.test.byId.get(r.id).V), TEST_V, 0.01)) &&
          close(o.R, 1 / used.reduce((s, r) => s + 1 / val(r), 0), 0.01);
      }),

      'fuse-blows': (st) => ofType(st, 'fuse').some((f) => f.blown),

      // A voltmeter across a 20 Ω resistor reading 4.00 V (a 6 V supply shared with a 10 Ω resistor)
      divider: (st, res) => ofType(st, 'voltmeter').some((m) => ofType(st, 'resistor').some((r) =>
        val(r) === 20 && across(res, m, r) && Math.abs(Math.abs(res.byId.get(m.id).V) - 4) < 0.03)),

      // A voltmeter across an LDR, in the dark, reading more than it does in bright light
      'ldr-dark': (st, res) => env.light < 20 && ofType(st, 'voltmeter').some((m) => ofType(st, 'ldr').some((l) => {
        if (!across(res, m, l)) return false;
        const bright = solve(st, { light: 80 });
        return Math.abs(res.byId.get(m.id).V) > Math.abs(bright.byId.get(m.id).V) + 0.1;
      })),

      'dark-switch': (st) => autoSwitch(st, 'light', 10, 90, ['led', 'lamp'], 'npn'),

      'hot-switch': (st) => autoSwitch(st, 'temp', 80, 10, ['motor'], 'mosfet'),

      // An LED or lamp that is on now but would be off if the capacitor had not charged up
      delay: (st, res) => ofType(st, 'capacitor').length > 0 && ofType(st, 'switch').some((s) => s.closed) &&
        (ofType(st, 'npn').length > 0 || ofType(st, 'mosfet').length > 0) &&
        st.comps.some((o) => (o.type === 'led' || o.type === 'lamp') && working(res, o.id) &&
          !working(solve(st, { capZero: true }), o.id)),
    };

    // Example circuits for each task (teacher only, under Show answers)
    const W = (...pts) => pts.slice(1).flatMap((q, i) => route(pts[i], q, pts[i][1] === q[1]));
    const C = (type, x, y, extra) => Object.assign({ type, x, y, rot: 0, closed: false }, extra);
    const loop = [W([8, 8], [5, 8], [5, 3], [8, 3]), W([10, 8], [13, 8], [13, 3], [10, 3])].flat();
    const seriesWires = [W([8, 8], [4, 8], [4, 3], [6, 3]), W([8, 3], [10, 3]), W([10, 8], [14, 8], [14, 3], [12, 3])].flat();
    const parallelWires = [W([8, 9], [5, 9], [5, 2], [8, 2]), W([5, 5], [8, 5]), W([10, 9], [13, 9], [13, 2], [10, 2]),
      W([10, 5], [13, 5])].flat();
    const ladder = (top, bottom) => ({
      comps: [C(top, 6, 2, { closed: true }), C('lamp', 11, 2), C(top, 6, 5, { closed: true }), C('lamp', 11, 5),
        C('cell', 6, 9)].concat(bottom ? [C(bottom, 11, 9)] : []),
      wires: [W([3, 2], [5, 2]), W([7, 2], [10, 2]), W([12, 2], [15, 2]), W([3, 5], [5, 5]), W([7, 5], [10, 5]),
        W([12, 5], [15, 5]), W([3, 2], [3, 9], [5, 9]),
        bottom ? W([7, 9], [10, 9]).concat(W([12, 9], [15, 9], [15, 2])) : W([7, 9], [15, 9], [15, 2])].flat(),
    });
    // Transistor switching circuit: supply on the left, a potential divider (top, bottom) at x = 6
    // feeding the base, and the output in the collector. `supply` is the parts on the left-hand side.
    const switching = (top, bottom, tr, output, ledResistor, supply) => ({
      comps: supply.comps.concat([top, bottom, C(tr, 12, 5), output],
        ledResistor ? [C('resistor', 9, 1, { value: 220 })] : []),
      wires: supply.wires.concat(ledResistor ? W([2, 1], [8, 1]).concat(W([10, 1], [12, 1])) : W([2, 1], [12, 1]),
        W([6, 1], [6, 2]), W([6, 4], [6, 6]), W([6, 5], [11, 5]), W([12, 3], [12, 4]), W([12, 6], [12, 9]),
        W([2, 9], [12, 9]), W([6, 8], [6, 9])),
    });
    const supply6 = { comps: [C('battery', 2, 5, { rot: 1, value: 6 })], wires: W([2, 4], [2, 1]).concat(W([2, 6], [2, 9])) };
    const EXAMPLES = {
      'one-lamp': { comps: [C('cell', 9, 8), C('lamp', 9, 3)], wires: loop },
      'switch-lamp': {
        comps: [C('cell', 7, 8), C('switch', 11, 8, { closed: true }), C('lamp', 9, 3)],
        wires: [W([6, 8], [4, 8], [4, 3], [8, 3]), W([8, 8], [10, 8]), W([12, 8], [14, 8], [14, 3], [10, 3])].flat(),
      },
      series: { comps: [C('cell', 9, 8), C('lamp', 7, 3), C('lamp', 11, 3)], wires: seriesWires },
      parallel: { comps: [C('cell', 9, 9), C('lamp', 9, 2), C('lamp', 9, 5)], wires: parallelWires },
      voltage: {
        comps: [C('cell', 9, 8), C('lamp', 9, 3), C('voltmeter', 9, 1)],
        wires: loop.concat(W([8, 1], [7, 1], [7, 3]), W([10, 1], [11, 1], [11, 3])),
      },
      'current-split': ladder('ammeter', 'ammeter'),
      'two-switches': ladder('switch', null),

      'series-resistance': { comps: [C('ohmmeter', 9, 8), C('resistor', 7, 3), C('resistor', 11, 3)], wires: seriesWires },
      'parallel-resistance': { comps: [C('ohmmeter', 9, 9), C('resistor', 9, 2), C('resistor', 9, 5)], wires: parallelWires },
      'fuse-blows': {
        comps: [C('battery', 7, 8, { value: 6 }), C('fuse', 11, 8), C('lamp', 9, 3)],
        wires: [W([6, 8], [4, 8], [4, 3], [8, 3]), W([8, 8], [10, 8]), W([12, 8], [14, 8], [14, 3], [10, 3]),
          W([8, 3], [8, 1], [10, 1], [10, 3])].flat(),
      },
      divider: {
        comps: [C('battery', 9, 8, { value: 6 }), C('resistor', 7, 3, { value: 10 }), C('resistor', 11, 3, { value: 20 }),
          C('voltmeter', 11, 1)],
        wires: seriesWires.concat(W([10, 1], [10, 3]), W([12, 1], [12, 3])),
      },
      'ldr-dark': {
        comps: [C('battery', 9, 8, { value: 6 }), C('resistor', 7, 3, { value: 1000 }), C('ldr', 11, 3), C('voltmeter', 11, 1)],
        wires: seriesWires.concat(W([10, 1], [10, 3]), W([12, 1], [12, 3])),
      },
      'dark-switch': switching(C('resistor', 6, 3, { rot: 1, value: 2200 }), C('ldr', 6, 7, { rot: 1 }), 'npn',
        C('led', 12, 2, { rot: 1 }), true, supply6),
      'hot-switch': switching(C('thermistor', 6, 3, { rot: 1 }), C('resistor', 6, 7, { rot: 1, value: 1000 }), 'mosfet',
        C('motor', 12, 2, { rot: 1 }), false, supply6),
      delay: switching(C('resistor', 6, 3, { rot: 1, value: 10000 }), C('capacitor', 6, 7, { rot: 1 }), 'npn',
        C('led', 12, 2, { rot: 1 }), true, {
          comps: [C('switch', 2, 3, { rot: 1 }), C('battery', 2, 7, { rot: 1, value: 6 })],
          wires: W([2, 2], [2, 1]).concat(W([2, 4], [2, 6]), W([2, 8], [2, 9])),
        }),
    };

    // ---------- Elements ----------
    const NS = 'http://www.w3.org/2000/svg';
    const board = root.querySelector('.cb-board');
    const layer = document.createElementNS(NS, 'g');
    board.setAttribute('viewBox', `0 0 ${COLS * S} ${ROWS * S}`);
    board.innerHTML =
      `<defs><pattern id="cb-dots${n}" width="${S}" height="${S}" patternUnits="userSpaceOnUse">` +
      `<circle cx="${S / 2}" cy="${S / 2}" r="2.2" class="cb-griddot"/></pattern>` +
      `<radialGradient id="cb-glow${n}"><stop offset="0" stop-color="var(--cb-glow)" stop-opacity="0.95"/>` +
      `<stop offset="1" stop-color="var(--cb-glow)" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="cb-glow-led${n}"><stop offset="0" stop-color="var(--cb-led)" stop-opacity="0.9"/>` +
      `<stop offset="1" stop-color="var(--cb-led)" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="cb-glow-heat${n}"><stop offset="0" stop-color="var(--cb-heat)" stop-opacity="0.9"/>` +
      `<stop offset="1" stop-color="var(--cb-heat)" stop-opacity="0"/></radialGradient></defs>` +
      `<rect class="cb-paper" width="${COLS * S}" height="${ROWS * S}" rx="8"/>` +
      (GUIDED ? '' : `<rect width="${COLS * S}" height="${ROWS * S}" fill="url(#cb-dots${n})"/>`);
    board.append(layer);

    const stage = root.querySelector('.cb-stage');
    const pop = root.querySelector('.cb-pop');
    const status = root.querySelector('.cb-status');
    const warning = root.querySelector('.cb-warning');
    const tasks = [...root.querySelectorAll('.cb-task')];
    const taskNav = root.querySelector('.cb-task-nav');

    // Nothing above the grid may change height while pupils build, or the grid jumps about.
    // So the status line and the warnings share one slot (a warning covers the status), and the
    // tasks share one box. Each is kept as tall as the tallest thing it can show.
    let msgBox = null;
    if (status && warning) {
      msgBox = document.createElement('div');
      msgBox.className = 'cb-msg';
      status.before(msgBox);
      msgBox.append(status, warning);
    }
    let taskBox = null;
    if (tasks.length) {
      taskBox = document.createElement('div');
      taskBox.className = 'cb-tasks';
      tasks[0].before(taskBox);
      taskBox.append(...tasks);
    }
    const ghost = document.createElement('div');
    ghost.className = 'cb-ghost';
    ghost.hidden = true;
    document.body.append(ghost);

    // Value controls in the pop-up: a list for fixed values, a slider for the variable resistor
    const pick = document.createElement('select');
    pick.className = 'cb-pick';
    pick.setAttribute('aria-label', 'Value');
    pick.hidden = true;
    const slide = document.createElement('input');
    slide.type = 'range';
    slide.className = 'cb-slide';
    slide.setAttribute('aria-label', 'Resistance');
    slide.hidden = true;
    if (pop) pop.prepend(pick, slide);

    // Light, Temperature and Sound sliders, only for components this page's palette has
    const palette = new Set([...root.querySelectorAll('.cb-palette [data-type]')].map((b) => b.dataset.type));
    const ENV = [
      { key: 'light', label: 'Light', types: ['ldr', 'solar-cell'],
        show: (v) => (v < 20 ? 'Dark' : v < 50 ? 'Dim' : v < 80 ? 'Bright' : 'Very bright') },
      { key: 'temp', label: 'Temperature', types: ['thermistor'], show: (v) => v + ' °C' },
      { key: 'sound', label: 'Sound', types: ['microphone'], show: (v) => (v === 0 ? 'Silent' : v < 50 ? 'Quiet' : 'Loud') },
    ].filter((s) => s.types.some((t) => palette.has(t)));
    const envBox = document.createElement('div');
    envBox.className = 'cb-env';
    ENV.forEach((s) => {
      const label = document.createElement('label');
      label.className = 'cb-env-item';
      label.innerHTML = `<span>${s.label}</span><input type="range" min="0" max="100" step="1"><output></output>`;
      const input = label.querySelector('input');
      s.input = input;
      const out = label.querySelector('output');
      s.sync = () => { input.value = env[s.key]; out.textContent = s.show(env[s.key]); };
      input.addEventListener('input', () => {
        env[s.key] = +input.value;
        out.textContent = s.show(env[s.key]);
        save();
        update();
      });
      s.item = label;
      s.sync();
      envBox.append(label);
    });
    if (ENV.length) root.querySelector('.cb-bar').after(envBox);

    const DEFAULT_MSG = 'Drag a component onto the grid. To add a wire, drag from the end of a component.';
    function say(msg) {
      if (!status) return;
      status.textContent = msg || DEFAULT_MSG;
      holdMsg();
    }

    const NOTES = {
      short: '<strong>Short circuit!</strong> The current has a path with almost no resistance, so it is far' +
        ' too big. A real cell would get hot and go flat quickly.',
      ohm: '<strong>The ohmmeter can’t measure.</strong> An ohmmeter only works with no supply connected.' +
        ' Take the cell or battery out of that part of the circuit.',
      fuse: '<strong>Fuse blown.</strong> The current was bigger than the fuse rating, so the wire inside it' +
        ' melted and broke the circuit. Fix the fault, then tap the fuse to replace it.',
    };
    // The longest status lines, measured up front so the slot never has to grow while in use
    const LONG_MSGS = [DEFAULT_MSG,
      'The fuse has blown: the current was more than its rating, so its wire melted and broke the circuit.',
      'Variable resistor selected. Choose its value, drag it to move it, or use Turn or Delete.',
      'Wire selected. Tap a component to join it into this wire, or use Delete.',
      'Example circuit for task 1. Undo brings back what was there before.',
      'Well done: you have finished task 1 and the Challenge.'];

    // Fix the message slot's height to fit the longest status line or any one warning at this width
    let msgH = 0;
    const hOf = (el) => Math.ceil(el.getBoundingClientRect().height);
    function sizeMsg() {
      if (!msgBox) return;
      const text = status.textContent, html = warning.innerHTML, hid = warning.hidden;
      msgBox.style.minHeight = '';
      let h = 0;
      LONG_MSGS.forEach((m) => { status.textContent = m; h = Math.max(h, hOf(msgBox)); });
      warning.hidden = false;
      Object.values(NOTES).forEach((n) => { warning.innerHTML = `<span>${n}</span>`; h = Math.max(h, hOf(msgBox)); });
      status.textContent = text;
      warning.innerHTML = html;
      warning.hidden = hid;
      msgH = h;
      msgBox.style.minHeight = h + 'px';
      holdMsg();
    }
    // Something taller than measured (two warnings at once): grow to fit, then stay that tall
    function holdMsg() {
      if (!msgBox || !msgH) return;
      const h = hOf(msgBox);
      if (h > msgH) { msgH = h; msgBox.style.minHeight = h + 'px'; }
    }

    // ---------- Drawing ----------
    const K = S / 30;   // symbol units to SVG units

    // The transform that puts a component's own drawing (centred on 0, 0) in place
    const placeTf = (c) => `translate(${at(c.x)} ${at(c.y)}) rotate(${c.rot * 90})${c.flip ? ' scale(-1 1)' : ''}`;

    function symbolId(c, res) {
      const t = TYPES[c.type];
      if (c.type === 'switch') return c.closed ? 'switch-closed' : 'switch-open';
      if (c.type === 'fuse') return c.blown ? 'fuse-blown' : 'fuse';
      if (c.type === 'relay') {
        const contacts = res.parts.has(c.id) && res.parts.get(c.id)[1];
        return contacts && contacts.on ? 'relay-closed' : 'relay-open';
      }
      return t.letter ? 'ring' : c.type;
    }

    function symbolSvg(c, res) {
      const g = geom(c);
      const [bx, by, bw, bh] = g.box;
      let s = `<use href="#sym-${symbolId(c, res)}" x="${(bx - g.anchor[0]) * K}" y="${(by - g.anchor[1]) * K}"` +
        ` width="${bw * K}" height="${bh * K}" transform="${placeTf(c)}"/>`;
      const t = TYPES[c.type];
      if (t.letter) s += `<text class="cb-letter" x="${at(c.x)}" y="${at(c.y) + 7.3}" text-anchor="middle">${t.letter}</text>`;
      // Supply rails: an open terminal at each end, labelled like an exam paper
      if (c.type === 'rails') {
        s = pinsOf(c).map(([x, y], i) =>
          `<circle class="cb-terminal" cx="${at(x)}" cy="${at(y)}" r="7"/>` +
          `<text class="cb-rail" x="${at(x) - 14}" y="${at(y) + 7}" text-anchor="end">` +
          `${i ? '0 V' : '+' + val(c).toFixed(1) + ' V'}</text>`).join('');
      }
      return s;
    }

    const num = (a) => (a >= 100 ? a.toFixed(0) : a >= 10 ? a.toFixed(1) : a.toFixed(2));
    function fmt(v, unit) {
      const a = Math.abs(v);
      if (PREFIX && unit === 'A' && a < 0.1) return num(a * 1000) + ' mA';
      return (a >= 100 ? a.toFixed(0) : a.toFixed(2)) + ' ' + unit;
    }
    function fmtR(R) { return PREFIX && R >= 1000 ? num(R / 1000) + ' kΩ' : num(R) + ' Ω'; }
    // A component's set value, for its label and the pop-up list
    function fmtVal(type, v) {
      const unit = TYPES[type].unit;
      if (unit === 'Ω' && v >= 1000) return v / 1000 + ' kΩ';
      return v + ' ' + unit;
    }
    const labelled = (c) => c.type === 'resistor' || c.type === 'variable-resistor' || ADJUST.has(c.type);

    // A rounded box around a component, lined up with it
    function outline(c, cls) {
      const [x0, y0, x1, y1] = geom(c).sel;
      return `<rect class="${cls}" x="${x0 * S}" y="${y0 * S}" width="${(x1 - x0) * S}" height="${(y1 - y0) * S}"` +
        ` rx="10" transform="${placeTf(c)}"/>`;
    }

    let shownNotes = '';
    function draw() {
      const st = clone(state);
      let bad = null;
      let extraWire = null;
      if (preview && preview.comp) {
        const i = st.comps.findIndex((c) => c.id === preview.comp.id);
        if (i >= 0) st.comps.splice(i, 1);
        if (preview.bad) bad = preview.comp; else st.comps.push(preview.comp);
        if (preview.cut) st.wires = st.wires.filter((e) => !preview.cut.includes(e));
      }
      if (preview && preview.wire) {
        if (preview.bad) extraWire = preview.wire;
        else st.wires = [...new Set(st.wires.concat(preview.wire))];
      }

      const res = solve(st);
      const flows = wireFlows(st, res);
      const shorted = res.els.filter((el) =>
        (el.c.type === 'cell' || el.c.type === 'battery') && Math.abs(el.I) > val(el.c) / SHORT_R);

      let glow = '', wires = '', flow = '', comps = '', dots = '', marks = '', labels = '', over = '';

      // Wires
      const selWire = sel && sel.wire;
      st.wires.forEach((e) => {
        const [[x1, y1], [x2, y2]] = ends(e);
        const cls = selWire && selWire.has(e) ? 'cb-wire is-selected' : 'cb-wire';
        wires += `<line class="${cls}" x1="${at(x1)}" y1="${at(y1)}" x2="${at(x2)}" y2="${at(y2)}"/>`;
        const I = flows.get(e) || 0;
        if (showFlow && Math.abs(I) > 0.002) {
          const [p, q] = I > 0 ? [[x1, y1], [x2, y2]] : [[x2, y2], [x1, y1]];
          const speed = Math.min(240, 200 * Math.abs(I));
          flow += `<line class="cb-flow" data-speed="${speed}" data-period="40" x1="${at(p[0])}" y1="${at(p[1])}"` +
            ` x2="${at(q[0])}" y2="${at(q[1])}"/>`;
        }
      });
      if (extraWire) {
        extraWire.forEach((e) => {
          const [[x1, y1], [x2, y2]] = ends(e);
          over += `<line class="cb-wire is-bad" x1="${at(x1)}" y1="${at(y1)}" x2="${at(x2)}" y2="${at(y2)}"/>`;
        });
      }

      // How many things meet at each grid point: three or more gets a junction dot
      const degree = new Map();
      const bump = (k) => degree.set(k, (degree.get(k) || 0) + 1);
      st.wires.forEach((e) => e.split('|').forEach(bump));
      st.comps.forEach((c) => pinsOf(c).forEach((p) => bump(pk(...p))));
      degree.forEach((d, k) => {
        const [x, y] = unpk(k);
        if (d >= 3) dots += `<circle class="cb-junction" cx="${at(x)}" cy="${at(y)}" r="6"/>`;
        // A loose end: show a hollow ring to invite a wire
        else if (d === 1 && st.comps.some((c) => pinsOf(c).some((p) => pk(...p) === k))) {
          marks += `<circle class="cb-end" cx="${at(x)}" cy="${at(y)}" r="7"/>`;
        }
      });

      // Components
      const comp = (c, cls) => {
        const x = at(c.x), y = at(c.y);
        const el = res.byId.get(c.id);
        const I = el ? Math.abs(el.I) : 0;
        const dim = dimOthers && focus.size && !focus.has(c.id) && c.type !== 'rails';
        let s = `<g class="cb-comp ${cls || ''}${dim ? ' is-dim' : ''}">`;
        if (focus.has(c.id)) s += outline(c, 'cb-focus');
        if (sel && sel.comp === c.id) s += outline(c, 'cb-sel');
        if (shorted.some((x2) => x2.c.id === c.id)) s += outline(c, 'cb-short');
        if (c.type === 'lamp' && el) {
          const b = (I * I * TYPES.lamp.R) / LAMP_FULL;
          if (I > 0.01) {
            const k = Math.min(1, Math.sqrt(b));
            glow += `<circle cx="${x}" cy="${y}" r="${S * (0.6 + 0.45 * Math.min(b, 2.5))}" fill="url(#cb-glow${n})"` +
              ` opacity="${k.toFixed(2)}"/>`;
            s += `<circle class="cb-lit" cx="${x}" cy="${y}" r="15" opacity="${k.toFixed(2)}"/>`;
          }
        }
        if (c.type === 'led' && el && el.on && I > 0.002) {
          const k = Math.min(1, I / 0.05);
          glow += `<circle cx="${x}" cy="${y}" r="${S * 0.95}" fill="url(#cb-glow-led${n})" opacity="${(0.35 + 0.65 * k).toFixed(2)}"/>`;
          s += `<circle class="cb-lit-led" cx="${x}" cy="${y}" r="16" opacity="${(0.3 + 0.5 * k).toFixed(2)}"/>`;
        }
        if (c.type === 'heater' && I > WORKING) {
          glow += `<circle cx="${x}" cy="${y}" r="${S * 1.1}" fill="url(#cb-glow-heat${n})"/>`;
          s += `<rect class="cb-lit-heat" x="${x - 22}" y="${y - 11}" width="44" height="22" rx="3"` +
            ` transform="rotate(${c.rot * 90} ${x} ${y})"/>`;
        }
        if (c.type === 'motor' && I > WORKING && showFlow) {
          s += `<circle class="cb-spin" data-speed="${Math.min(200, 160 * I)}" data-period="14.45" cx="${x}" cy="${y}" r="23"/>`;
        }
        // Sound waves coming out of the cone
        if (c.type === 'loudspeaker' && I > 0.005) {
          s += `<path class="cb-sound" d="M-12 -34Q0 -40 12 -34M-20 -42Q0 -51 20 -42" opacity="${Math.min(1, 0.3 + I / 0.03).toFixed(2)}"` +
            ` transform="${placeTf(c)}"/>`;
        }
        s += symbolSvg(c, res) + '</g>';

        // Readings
        const vertical = c.rot % 2 === 1;
        const lx = vertical ? x + S * 1.2 : x;
        const ly = vertical ? y : y - S * 0.95;
        const pill = (text, cls2) =>
          `<g class="cb-reading ${cls2 || ''}"><rect x="${lx - 44}" y="${ly - 15}" width="88" height="30" rx="8"/>` +
          `<text x="${lx}" y="${ly + 6.5}" text-anchor="middle">${text}</text></g>`;
        if (el && c.type === 'ammeter') labels += pill(fmt(el.I, 'A'));
        if (el && c.type === 'voltmeter') labels += pill(fmt(el.V, 'V'));
        if (el && c.type === 'ohmmeter' && res.ohm.has(c.id)) labels += pill(res.ohm.get(c.id).show);
        // Set values: above a component, or starting just to the right of an upright one
        if (labelled(c)) {
          labels += `<text class="cb-value" x="${vertical ? x + S * (GUIDED ? 0.85 : 0.6) : x}" y="${ly + 6}"` +
            ` text-anchor="${vertical ? 'start' : 'middle'}">${fmtVal(c.type, val(c))}</text>`;
        }
        return s;
      };
      st.comps.forEach((c) => { comps += comp(c); });
      if (bad) over += comp(bad, 'is-bad');

      if (pending) {
        over += `<circle class="cb-pending" cx="${at(pending[0])}" cy="${at(pending[1])}" r="13"/>`;
      }

      // Walkthrough notes: labels the walkthrough asks for, placed in grid steps
      if (annotate) {
        annotate(reader(res)).forEach((a) => {
          labels += `<text class="cb-note ${a.cls || ''}" x="${at(a.x)}" y="${at(a.y) + 6}"` +
            ` text-anchor="${a.anchor || 'middle'}">${a.text}</text>`;
        });
      }

      layer.innerHTML = `<g>${glow}</g><g>${wires}</g><g>${flow}</g><g>${comps}</g><g>${dots}</g>` +
        `<g>${marks}</g><g>${labels}</g><g>${over}</g>`;
      movers = [...layer.querySelectorAll('[data-speed]')];
      if (movers.length) startAnimation();

      // Warnings, changed only when they change (the box is read out by screen readers)
      const notes = [];
      if (shorted.length) notes.push(NOTES.short);
      if ([...res.ohm.values()].some((o) => o.error)) notes.push(NOTES.ohm);
      if (st.comps.some((c) => c.type === 'fuse' && c.blown)) notes.push(NOTES.fuse);
      const html = notes.map((t) => `<span>${t}</span>`).join(' ');
      if (html !== shownNotes && warning) {
        shownNotes = html;
        warning.innerHTML = html;
        warning.hidden = !notes.length;
        if (msgBox) msgBox.classList.toggle('has-warning', notes.length > 0);
        holdMsg();
      }
      // The sliders stay in place (so nothing moves), greyed out until something on the grid senses them
      ENV.forEach((s) => {
        const on = st.comps.some((c) => s.types.includes(c.type));
        s.item.classList.toggle('is-off', !on);
        s.input.disabled = !on;
      });

      placePop();
      if (wantsTick(res)) startTick();
      return res;
    }

    // ---------- Moving dots ----------
    let movers = [];
    let animating = false;
    const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function startAnimation() {
      if (animating || reduceMotion()) return;
      animating = true;
      const t0 = performance.now();
      const frame = (now) => {
        if (!movers.length) { animating = false; return; }
        const t = (now - t0) / 1000;
        movers.forEach((m) => {
          const period = +m.dataset.period;
          m.style.strokeDashoffset = String(-((t * +m.dataset.speed) % period));
        });
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    }

    // ---------- Time: capacitors charging, microphone AC ----------
    let tickTimer = null;
    function wantsTick(res) {
      return res.els.some((el) => el.c.type === 'capacitor' && Math.abs(el.I) > 1e-5) ||
        (env.sound > 0 && state.comps.some((c) => c.type === 'microphone')) ||
        state.comps.some((c) => c.type === 'ac-supply');
    }
    function startTick() {
      if (!tickTimer) tickTimer = setTimeout(tick, DT * 1000);
    }
    function tick() {
      tickTimer = null;
      clock += DT;
      solve(state).els.forEach((el) => { if (el.c.type === 'capacitor') capV.set(el.c.id, el.V); });
      if (preview) draw(); else update();
    }

    function svgPoint(x, y) {
      const p = board.createSVGPoint();
      p.x = x;
      p.y = y;
      return p;
    }

    // ---------- Selection pop-up (Turn, Delete, value) ----------
    function placePop() {
      if (!pop) return;
      let target = null;
      if (sel && sel.comp) {
        const c = state.comps.find((c2) => c2.id === sel.comp);
        if (c && !drag) {
          const [x0, y0, x1, y1] = geom(c).sel;
          const half = c.rot % 2 ? Math.max(-x0, x1) : Math.max(-y0, y1);
          target = { x: at(c.x), y: at(c.y), r: (half + 0.15) * S, comp: c };
        }
      } else if (sel && sel.wire && !drag) {
        const pts = [...sel.wire].flatMap(ends);
        const xs = pts.map((p) => at(p[0])), ys = pts.map((p) => at(p[1]));
        target = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.min(...ys), r: S * 0.4 };
      }
      pop.hidden = !target;
      if (!target) return;
      const c = target.comp;
      const turn = pop.querySelector('[data-act="turn"]');
      turn.hidden = !c;
      if (c) turn.textContent = geom(c).flips ? 'Flip' : 'Turn';
      const t = c && TYPES[c.type];
      pick.hidden = !(t && t.choices && ADJUST.has(c.type));
      if (!pick.hidden) {
        if (pick.dataset.type !== c.type) {
          pick.dataset.type = c.type;
          pick.innerHTML = t.choices.map((v) => `<option value="${v}">${fmtVal(c.type, v)}</option>`).join('');
        }
        pick.value = String(val(c));
      }
      slide.hidden = !(t && t.slider);
      if (!slide.hidden && !sliding) {
        slide.min = '0';
        slide.max = String(t.slider.length - 1);
        const i = t.slider.indexOf(val(c));
        slide.value = String(i < 0 ? t.slider.length - 1 : i);
      }
      const m = board.getScreenCTM();
      const box = stage.getBoundingClientRect();
      const p = svgPoint(target.x, target.y).matrixTransform(m);
      const scale = m.a;
      const w = pop.offsetWidth, h = pop.offsetHeight;
      let top = p.y - box.top - target.r * scale - h - 8;
      if (top < 4) top = p.y - box.top + target.r * scale + 8;
      const left = Math.max(4, Math.min(box.width - w - 4, p.x - box.left - w / 2));
      pop.style.left = left + 'px';
      pop.style.top = top + 'px';
    }

    const selected = () => sel && sel.comp && state.comps.find((c2) => c2.id === sel.comp);

    if (pop) pop.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn || !sel) return;
      if (btn.dataset.act === 'delete') {
        if (sel.comp) commit(() => { state.comps = state.comps.filter((c) => c.id !== sel.comp); });
        else commit(() => { state.wires = state.wires.filter((w) => !sel.wire.has(w)); });
        sel = null;
        say();
        update();
      }
      if (btn.dataset.act === 'turn') {
        const c = selected();
        const tries = geom(c).flips ? [{ flip: !c.flip }] : [1, 2, 3].map((k) => ({ rot: (c.rot + k) % 4 }));
        for (const change of tries) {
          const t = Object.assign({}, c, change);
          if (canPlace(state, t)) { commit(() => { Object.assign(c, change); }); return; }
        }
        say('There is no room to turn it here. Move it somewhere with more space first.');
      }
    });

    pick.addEventListener('change', () => {
      const c = selected();
      if (!c) return;
      commit(() => { c.value = +pick.value; });
      say(TYPES[c.type].name + ' set to ' + fmtVal(c.type, c.value) + '.');
    });

    // The slider changes the circuit as it moves; Undo takes it back to where the slide started
    let sliding = false;
    slide.addEventListener('input', () => {
      const c = selected();
      if (!c) return;
      if (!sliding) {
        history.push(clone(state));
        sliding = true;
      }
      c.value = TYPES[c.type].slider[+slide.value];
      say(TYPES[c.type].name + ' set to ' + fmtVal(c.type, c.value) + '.');
      save();
      update();
    });
    slide.addEventListener('change', () => { sliding = false; });

    // ---------- Board pointer handling ----------
    function gridAt(e) {
      const p = svgPoint(e.clientX, e.clientY).matrixTransform(board.getScreenCTM().inverse());
      const fx = (p.x - S / 2) / S, fy = (p.y - S / 2) / S;
      const x = Math.max(0, Math.min(COLS - 1, Math.round(fx)));
      const y = Math.max(0, Math.min(ROWS - 1, Math.round(fy)));
      return { x, y, fx, fy };
    }
    const outside = (e) => {
      const r = board.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    const compAt = (x, y) => state.comps.find((c) => has(bodyOf(c), [x, y]));
    const isEnd = (x, y) => state.comps.some((c) => has(pinsOf(c), [x, y]));

    // The wire nearest a point, if the finger is on one
    function wireNear(fx, fy) {
      let best = null, bestD = 0.32;
      state.wires.forEach((e) => {
        const [[x1, y1], [x2, y2]] = ends(e);
        const d = y1 === y2
          ? (fx >= x1 - 0.15 && fx <= x2 + 0.15 ? Math.abs(fy - y1) : 9)
          : (fy >= y1 - 0.15 && fy <= y2 + 0.15 ? Math.abs(fx - x1) : 9);
        if (d < bestD) { bestD = d; best = e; }
      });
      return best;
    }

    // A whole wire from one connection to the next: follow it through plain bends
    function wireRun(edge) {
      const deg = new Map();
      state.wires.forEach((e) => e.split('|').forEach((k) => deg.set(k, (deg.get(k) || 0) + 1)));
      const run = new Set([edge]);
      const todo = edge.split('|');
      while (todo.length) {
        const k = todo.pop();
        const [x, y] = unpk(k);
        if (deg.get(k) !== 2 || isEnd(x, y)) continue;
        state.wires.forEach((e) => {
          if (!run.has(e) && e.split('|').includes(k)) {
            run.add(e);
            todo.push(e.split('|').find((p) => p !== k));
          }
        });
      }
      return run;
    }

    function addWire(edges) {
      commit(() => { state.wires = [...new Set(state.wires.concat(edges))]; });
    }

    function selectMsg(c) {
      const name = TYPES[c.type].name;
      if (TYPES[c.type].slider) return name + ' selected. Use the slider to change its resistance.';
      if (TYPES[c.type].choices && ADJUST.has(c.type)) return name + ' selected. Choose its value, drag it to move it, or use Turn or Delete.';
      if (geom(c).flips) return name + ' selected. Drag it to move it, or use Flip or Delete.';
      return name + ' selected. Drag it to move it, or use Turn or Delete.';
    }

    function tap(g) {
      const c = compAt(g.x, g.y);
      if (c) {
        pending = null;
        if (c.type === 'switch') {
          commit(() => { c.closed = !c.closed; });
          sel = { comp: c.id };
          say(c.closed ? 'Switch closed: the gap is joined, so current can flow.' : 'Switch open: there is a gap, so no current can flow through it.');
        } else if (c.type === 'fuse' && c.blown) {
          sel = { comp: c.id };
          say('New fuse fitted.');
          commit(() => { c.blown = false; });
        } else if (sel && sel.comp === c.id) {
          sel = null;
          say();
        } else {
          sel = { comp: c.id };
          say(selectMsg(c));
        }
        draw();
        return;
      }
      const p = [g.x, g.y];
      if (pending) {
        if (same(pending, p)) { pending = null; say(); draw(); return; }
        const r = bestRoute(state, pending, p, true);
        if (r.ok) { pending = null; sel = null; say(); addWire(r.edges); }
        else say('A wire can’t go through a component. Try a different spot.');
        return;
      }
      const w = wireNear(g.fx, g.fy);
      if (isEnd(g.x, g.y)) {
        pending = p;
        sel = null;
        say('Now tap where the wire should go.');
        draw();
        return;
      }
      if (w) {
        sel = { wire: wireRun(w) };
        say('Wire selected. Tap a component to join it into this wire, or use Delete.');
      } else {
        sel = null;
        say();
      }
      draw();
    }

    board.addEventListener('pointerdown', (e) => {
      if (drag || e.button > 0) return;
      if (GUIDED) {
        // Locked: a tap on a switch opens or closes it; a tap on anything else tells the walkthrough
        const g = gridAt(e);
        const c = compAt(g.x, g.y);
        if (!c) return;
        if (c.type === 'switch') { c.closed = !c.closed; update(); }
        root.dispatchEvent(new CustomEvent('cb:tap', { detail: { id: c.id } }));
        return;
      }
      const g = gridAt(e);
      drag = { id: e.pointerId, cx: e.clientX, cy: e.clientY, start: g, moving: false, comp: compAt(g.x, g.y) };
      // Keep receiving this finger's moves even if it slides off the grid
      board.setPointerCapture(e.pointerId);
    });

    board.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moving) {
        if (Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 10) return;
        drag.moving = true;
        pending = null;
        pop.hidden = true;
      }
      const g = gridAt(e);
      if (drag.comp) {
        // Move the component with the finger; off the board means "remove"
        const c = drag.comp;
        const moved = Object.assign({}, c, { x: c.x + g.x - drag.start.x, y: c.y + g.y - drag.start.y });
        drag.off = outside(e);
        const key = drag.off ? 'off' : moved.x + ',' + moved.y;
        if (key === drag.last) return;
        drag.last = key;
        preview = drag.off ? { comp: c, bad: true } : placement(state, moved);
        say(drag.off ? 'Let go here to remove it.' : preview.cut ? SPLICE_MSG : '');
        draw();
        return;
      }
      // Draw a wire: straight, or with one right-angled corner
      const p = [drag.start.x, drag.start.y];
      const q = [g.x, g.y];
      const key = q.join(',');
      if (key === drag.last) return;
      drag.last = key;
      if (same(p, q)) { preview = null; draw(); return; }
      if (drag.horizontal === undefined) drag.horizontal = Math.abs(g.fx - p[0]) >= Math.abs(g.fy - p[1]);
      const r = bestRoute(state, p, q, drag.horizontal);
      preview = { wire: r.edges, bad: !r.ok };
      draw();
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      const pv = preview;
      drag = null;
      preview = null;
      if (!d.moving) {
        if (e.type === 'pointerup') tap(d.start);
        return;
      }
      if (e.type === 'pointercancel' || !pv) { draw(); return; }
      if (pv.comp) {
        if (d.off) {
          commit(() => { state.comps = state.comps.filter((c) => c.id !== d.comp.id); });
          sel = null;
          say('Removed.');
        } else if (!pv.bad) {
          commit(() => {
            Object.assign(d.comp, { x: pv.comp.x, y: pv.comp.y, rot: pv.comp.rot });
            if (pv.cut) state.wires = state.wires.filter((e) => !pv.cut.includes(e));
          });
          sel = { comp: d.comp.id };
          say(pv.cut ? TYPES[d.comp.type].name + ' joined into the wire.' : '');
        } else {
          say('It can’t go there: it would sit on top of something. Try a clear spot.');
        }
        draw();
        return;
      }
      if (pv.wire && !pv.bad) { sel = null; say(); addWire(pv.wire); }
      else { say('A wire can’t go through a component. Go round it.'); draw(); }
    }
    board.addEventListener('pointerup', endDrag);
    board.addEventListener('pointercancel', endDrag);
    board.addEventListener('lostpointercapture', (e) => {
      if (drag && e.pointerId === drag.id) endDrag({ type: 'pointercancel', pointerId: e.pointerId });
    });

    // ---------- Palette: drag a component in, or tap to drop it in a free space ----------
    function freeSpot(type) {
      const spots = [];
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) spots.push([x, y]);
      spots.sort((a, b) => Math.hypot(a[0] - 9, (a[1] - 5) * 1.6) - Math.hypot(b[0] - 9, (b[1] - 5) * 1.6));
      for (const [x, y] of spots) {
        const c = newComp(type, x, y);
        // Leave a gap round it so it doesn't touch anything by accident
        const clear = state.comps.every((o) => Math.abs(o.x - x) + Math.abs(o.y - y) >= 4) &&
          !state.wires.some((e) => ends(e).some((p) => Math.abs(p[0] - x) <= 1 && Math.abs(p[1] - y) <= 1));
        if (clear && canPlace(state, c)) return c;
      }
      // Crowded grid: settle for any space it fits
      for (const [x, y] of spots) {
        const c = newComp(type, x, y);
        if (canPlace(state, c)) return c;
      }
      return null;
    }

    function addComp(c, cut) {
      const id = state.next;
      commit(() => {
        state.next += 1;
        state.comps.push(Object.assign({}, c, { id }));
        if (cut) state.wires = state.wires.filter((e) => !cut.includes(e));
      });
      sel = { comp: id };
      pending = null;
      draw();
    }

    root.querySelectorAll('.cb-palette [data-type]').forEach((btn) => {
      const type = btn.dataset.type;
      let p = null;
      let dragged = false;
      btn.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        p = { id: e.pointerId, x: e.clientX, y: e.clientY, moving: false };
        btn.setPointerCapture(e.pointerId);
      });
      btn.addEventListener('pointermove', (e) => {
        if (!p || e.pointerId !== p.id) return;
        if (!p.moving) {
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 10) return;
          p.moving = true;
          ghost.innerHTML = btn.querySelector('svg').outerHTML;
          sel = null;
          pending = null;
        }
        if (outside(e)) {
          ghost.hidden = false;
          ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
          if (preview) { preview = null; draw(); }
          p.last = null;
          return;
        }
        ghost.hidden = true;
        const g = gridAt(e);
        const key = g.x + ',' + g.y;
        if (key === p.last) return;
        p.last = key;
        preview = placement(state, newComp(type, g.x, g.y));
        say(preview.cut ? SPLICE_MSG : '');
        draw();
      });
      const end = (e) => {
        if (!p || e.pointerId !== p.id) return;
        const was = p.moving;
        p = null;
        ghost.hidden = true;
        if (!was) return;
        dragged = true;
        setTimeout(() => { dragged = false; }, 0);
        const pv = preview;
        preview = null;
        if (e.type === 'pointerup' && pv && !pv.bad) {
          addComp(pv.comp, pv.cut);
          say(pv.cut ? TYPES[type].name + ' joined into the wire.' : '');
        }
        else {
          if (pv) say('It can’t go there: it would sit on top of something. Try a clear spot.');
          draw();
        }
      };
      btn.addEventListener('pointerup', end);
      btn.addEventListener('pointercancel', end);
      btn.addEventListener('click', () => {
        if (dragged) return;
        if (sel && sel.wire) {
          // Tap fallback for dropping onto a wire: put it into the selected wire, near its middle
          const pts = [...new Set([...sel.wire].flatMap((e) => e.split('|')))].map(unpk);
          const mx = pts.reduce((s, p2) => s + p2[0], 0) / pts.length;
          const my = pts.reduce((s, p2) => s + p2[1], 0) / pts.length;
          pts.sort((a, b) => Math.hypot(a[0] - mx, a[1] - my) - Math.hypot(b[0] - mx, b[1] - my));
          for (const [x, y] of pts) {
            const s = spliceInto(state, newComp(type, x, y));
            if (s) { addComp(s.comp, s.cut); say(TYPES[type].name + ' joined into the wire.'); return; }
          }
          say(geom(newComp(type, 0, 0)) === GEOMS.two
            ? 'That wire is too short to fit a component. It needs a straight part at least two squares long.'
            : 'That component can’t be dropped into a wire. Put it on the grid and join wires to it.');
          return;
        }
        const c = freeSpot(type);
        if (!c) { say('The grid is full. Remove something first.'); return; }
        addComp(c);
        say(TYPES[type].name + ' added. Drag it where you want it.');
      });
    });

    // ---------- Toolbar ----------
    const undoBtn = root.querySelector('[data-cb="undo"]');
    if (undoBtn) undoBtn.addEventListener('click', () => {
      if (!history.length) { say('Nothing to undo.'); return; }
      state = history.pop();
      sel = null;
      pending = null;
      save();
      say();
      update();
    });
    const clearBtn = root.querySelector('[data-cb="clear"]');
    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (!state.comps.length && !state.wires.length) return;
      commit(() => { state.comps = []; state.wires = []; });
      capV.clear();
      sel = null;
      pending = null;
      say('Grid cleared. Undo brings it back.');
      draw();
    });
    const flowBtn = root.querySelector('[data-cb="flow"]');
    if (flowBtn) flowBtn.addEventListener('click', () => {
      showFlow = !showFlow;
      flowBtn.setAttribute('aria-pressed', String(showFlow));
      draw();
    });

    // ---------- Tasks ----------
    const nav = tasks.map((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cb-chip';
      b.textContent = t.classList.contains('q-challenge') ? 'Challenge' : String(i + 1);
      b.addEventListener('click', () => { task = i; save(); showTask(); });
      taskNav.insertBefore(b, taskNav.querySelector('.cb-example'));
      return b;
    });

    function showTask() {
      tasks.forEach((t, i) => { t.hidden = i !== task; });
      nav.forEach((b, i) => {
        b.classList.toggle('is-done', solved.has(i));
        if (i === task) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
        b.setAttribute('aria-label', (b.textContent === 'Challenge' ? 'Challenge' : 'Task ' + (i + 1)) +
          (solved.has(i) ? ', done' : ''));
      });
      tasks.forEach((t, i) => feedback(t, i, solved.has(i)));
    }

    function feedback(t, i, done) {
      const box = t.querySelector('.q-feedback');
      if (!box) return;
      t.classList.toggle('is-solved', done);
      if (done) {
        const explain = t.querySelector('.q-explain');
        const last = i === tasks.length - 1;
        box.className = 'q-feedback is-good';
        box.innerHTML = '<strong>Correct!</strong> ' + (explain ? explain.innerHTML : '') +
          (last ? '' : ' <button type="button" class="tool cb-next">Next task</button>');
      } else {
        box.className = 'q-feedback';
        box.innerHTML = '';
      }
    }

    // Fix the task box's height to fit the tallest task with its "Correct!" message showing, so
    // finishing a task or moving to the next one doesn't move the grid. (An opened hint still can:
    // the pupil asked for that.)
    function sizeTasks() {
      if (!taskBox) return;
      taskBox.style.minHeight = '';
      const open = [...taskBox.querySelectorAll('details[open]')];
      open.forEach((d) => { d.open = false; });
      let h = 0;
      tasks.forEach((t, i) => {
        tasks.forEach((o) => { o.hidden = o !== t; });
        feedback(t, i, true);
        h = Math.max(h, hOf(taskBox));
      });
      open.forEach((d) => { d.open = true; });
      showTask();
      taskBox.style.minHeight = h + 'px';
      // The chips get wider as they are marked done, and may wrap onto another row.
      // (Show answers adds a button here too; this runs again when it is pressed.)
      if (taskNav) {
        taskNav.style.minHeight = '';
        const done = nav.map((b) => b.classList.contains('is-done'));
        nav.forEach((b) => b.classList.add('is-done'));
        const nh = hOf(taskNav);
        nav.forEach((b, i) => b.classList.toggle('is-done', done[i]));
        taskNav.style.minHeight = nh + 'px';
      }
    }

    function sizeAll() { sizeMsg(); sizeTasks(); }

    root.addEventListener('click', (e) => {
      if (e.target.closest('.cb-next')) {
        task = Math.min(tasks.length - 1, task + 1);
        save();
        showTask();
      }
      if (e.target.closest('[data-cb="example"]')) {
        const ex = EXAMPLES[tasks[task].dataset.check];
        if (!ex) return;
        commit(() => {
          state.comps = ex.comps.map((c) => Object.assign({}, c, { id: state.next++ }));
          state.wires = ex.wires.slice();
        });
        sel = null;
        pending = null;
        say('Example circuit for task ' + (task + 1) + '. Undo brings back what was there before.');
        draw();
      }
    });

    function checkTasks(res) {
      let fresh = [];
      tasks.forEach((t, i) => {
        if (solved.has(i)) return;
        const check = CHECKS[t.dataset.check];
        if (check && check(state, res)) { solved.add(i); fresh.push(i); }
      });
      if (!fresh.length) return;
      save();
      showTask();
      const names = fresh.map((i) => (i === tasks.length - 1 ? 'the Challenge' : 'task ' + (i + 1)));
      say('Well done: you have finished ' + names.join(' and ') + '.');
    }

    // A fuse carrying more than its rating melts. The one most over its rating goes first.
    function blowFuses(res) {
      for (let round = 0; round < 5; round++) {
        let worst = null, most = 1;
        res.els.forEach((el) => {
          if (el.c.type !== 'fuse' || el.c.blown) return;
          const over = Math.abs(el.I) / val(el.c);
          if (over > most) { most = over; worst = el.c.id; }
        });
        if (worst == null) return res;
        state.comps.find((c) => c.id === worst).blown = true;
        save();
        say('The fuse has blown: the current was more than its rating, so its wire melted and broke the circuit.');
        res = draw();
      }
      return res;
    }

    function update() {
      const res = blowFuses(draw());
      checkTasks(res);
      if (listeners.length) {
        const r = reader(res);
        listeners.forEach((fn) => fn(r));
      }
    }

    // starter.js resets the question cards; this clears the board and progress too
    const resetBtn = document.querySelector('[data-reset]');
    if (resetBtn && !GUIDED) {
      resetBtn.addEventListener('click', () => {
        history = [];
        state = { comps: [], wires: [], next: 1 };
        env = Object.assign({}, ENV_START);
        ENV.forEach((s) => s.sync());
        capV.clear();
        solved = new Set();
        task = 0;
        sel = null;
        pending = null;
        save();
        say();
        showTask();
        draw();
      });
    }

    window.addEventListener('resize', () => placePop());

    // Measure again whenever the width changes (turning the iPad, or an embed sizing itself)
    let sizedW = -1;
    const resize = () => {
      const w = root.clientWidth;
      if (w && w !== sizedW) { sizedW = w; sizeAll(); }
    };
    if (window.ResizeObserver) new ResizeObserver(() => setTimeout(resize)).observe(root);
    else window.addEventListener('resize', resize);
    // Show answers puts the explanations on unfinished tasks
    const answersBtn = document.querySelector('[data-show-answers]');
    if (answersBtn && taskBox) answersBtn.addEventListener('click', () => setTimeout(sizeTasks));

    // ---------- Walkthrough controls (circuit-walkthroughs.js drives a data-guided board) ----------
    // A circuit is { comps: [{ id, type, x, y, rot, value, closed }], wires: [edge keys], view: [x0, y0, x1, y1] },
    // where view is the part of the grid to show, in grid steps.
    const paper = board.querySelector('.cb-paper');
    root.cbApi = {
      // env: slider settings to start from; notes: the walkthrough's labels for this circuit
      load(circuit, startEnv, notes) {
        Object.assign(env, startEnv);
        annotate = notes || null;
        focus = new Set();
        state = { comps: clone(circuit.comps).map((c) => Object.assign({ rot: 0, closed: false }, c)),
          wires: circuit.wires.slice(), next: 1 };
        capV.clear();
        clock = 0;
        if (circuit.view) {
          const [x0, y0, x1, y1] = circuit.view;
          const box = [at(x0) - S / 2, at(y0) - S / 2, (x1 - x0 + 1) * S, (y1 - y0 + 1) * S];
          board.setAttribute('viewBox', box.join(' '));
          ['x', 'y', 'width', 'height'].forEach((k, i) => paper.setAttribute(k, box[i]));
        }
        update();
      },
      setEnv(key, v) { env[key] = v; update(); },
      setValue(id, v) { state.comps.find((c) => c.id === id).value = v; update(); },
      setClosed(id, closed) { state.comps.find((c) => c.id === id).closed = closed; update(); },
      emptyCapacitors() { capV.clear(); update(); },
      focus(ids, dim = true) { focus = new Set(ids || []); dimOthers = dim; draw(); },
      annotate(fn) { annotate = fn; draw(); },
      // Readings now, or for other slider settings: read({ temp: 30 })
      read(opts) { return reader(opts ? solve(state, opts) : solve(state), opts); },
      onUpdate(fn) { listeners.push(fn); },
      name: (type) => TYPES[type].name,
    };

    say();
    showTask();
    update();
    resize();
  }
})();
