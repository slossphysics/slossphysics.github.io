// Slide-it variable resistor: a 6 V battery, an ammeter, a lamp and a slider variable resistor
// in one loop. Pupils drag the slider along the coil (or tap anywhere on it, or use the arrow
// keys); the lamp, the ammeter reading and the moving dots on the wire all follow.
// The picture is markup on the page ([data-dimmer]); this file only moves things.
(function () {
  'use strict';

  const SUPPLY = 6;        // volts
  const LAMP_R = 10;       // ohms, treated as fixed
  const MAX_R = 50;        // ohms, slider at the far right
  const X0 = 160, X1 = 560; // slider travel, in SVG units
  const COIL_X = 150;

  document.querySelectorAll('[data-dimmer]').forEach((box) => {
    const svg = box.querySelector('svg');
    const $ = (sel) => box.querySelector(sel);
    const rheo = $('.dm-rheo'), knob = $('.dm-knob'), coilOn = $('.dm-coil-on');
    const flow = $('.dm-flow'), tap = $('.dm-tap');
    const glow = $('.dm-glow'), glass = $('.dm-glass'), reading = $('.dm-reading');
    const outR = $('[data-dm="r"]'), outI = $('[data-dm="i"]'), outLamp = $('[data-dm="lamp"]');

    let frac = 0.5;   // 0 = slider at the left (no resistance), 1 = far right
    let current = 0;

    function set(f) {
      frac = Math.min(1, Math.max(0, f));
      const x = X0 + (X1 - X0) * frac;
      const R = Math.round(MAX_R * frac);
      current = SUPPLY / (LAMP_R + R);
      const iMax = SUPPLY / LAMP_R, iMin = SUPPLY / (LAMP_R + MAX_R);
      // How bright the lamp is drawn: 0 (barely glowing) to 1
      const b = Math.pow((current - iMin) / (iMax - iMin), 0.8);

      knob.setAttribute('transform', 'translate(' + x + ' 0)');
      knob.setAttribute('aria-valuenow', String(R));
      knob.setAttribute('aria-valuetext', R + ' ohms');
      coilOn.setAttribute('width', String(x - COIL_X));
      tap.setAttribute('d', 'M' + x + ' 270V330');
      // The way the current goes: battery, ammeter, lamp, along the rod to the slider,
      // down into the coil and back along the coil to the battery
      flow.setAttribute('d', 'M60 190V110H660V270H' + x + 'V330H60V250');

      glow.setAttribute('r', String(36 + 48 * b));
      glow.setAttribute('opacity', String(0.08 + 0.8 * b));
      glass.setAttribute('fill', 'rgb(255,' + Math.round(250 - 40 * b) + ',' + Math.round(225 - 195 * b) + ')');

      const amps = current.toFixed(2) + ' A';
      reading.textContent = amps;
      outR.textContent = R + ' Ω';
      outI.textContent = amps;
      outLamp.textContent = b > 0.7 ? 'Very bright' : b > 0.35 ? 'Bright' : b > 0.12 ? 'Dim' : 'Very dim';
    }

    // Where a touch is, in the SVG's own units
    function fracAt(e) {
      const p = svg.createSVGPoint();
      p.x = e.clientX; p.y = e.clientY;
      const x = p.matrixTransform(svg.getScreenCTM().inverse()).x;
      return (x - X0) / (X1 - X0);
    }

    let dragging = false;
    rheo.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { rheo.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      box.classList.add('is-used');
      set(fracAt(e));
      e.preventDefault();
    });
    rheo.addEventListener('pointermove', (e) => { if (dragging) set(fracAt(e)); });
    const stop = () => { dragging = false; };
    rheo.addEventListener('pointerup', stop);
    rheo.addEventListener('pointercancel', stop);

    knob.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -0.04, ArrowDown: -0.04, ArrowRight: 0.04, ArrowUp: 0.04 }[e.key];
      if (e.key === 'Home') set(0);
      else if (e.key === 'End') set(1);
      else if (step) set(frac + step);
      else return;
      box.classList.add('is-used');
      e.preventDefault();
    });

    set(frac);

    // Dots drift round the loop, faster for a bigger current
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let offset = 0, last = 0;
    function tick(now) {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      offset = (offset - 230 * current * dt) % 26.1;
      flow.style.strokeDashoffset = offset;
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
})();
