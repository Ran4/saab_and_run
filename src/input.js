// Keyboard, mouse (pointer lock) and gamepad, folded into a handful of game actions.

const down = new Set();
const pressed = new Set();
let mdx = 0, mdy = 0;
// Pad buttons are copied into fixed arrays (no garbage per frame); axes are always four finite
// numbers (a pad with fewer axes - a laptop's accelerometer, a 3-axis stick - reads 0 for the rest).
const PAD_BUTTONS = 17;
let padPrev = new Float32Array(PAD_BUTTONS), padNow = new Float32Array(PAD_BUTTONS), padAxes = [0, 0, 0, 0];
let padOn = false;      // a pad is connected and in use
let padTrig = false;    // it has analogue triggers that have been seen moving (else the stick drives)
const woken = new Set();  // non-standard pads (by index) that have had a button pressed

const KEYS = {
  jump: ['Space'],
  attack: ['KeyJ', 'Mouse0', 'KeyK'],
  interact: ['KeyE', 'Enter'],
  report: ['KeyF'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  handbrake: ['Space'],
  horn: ['KeyT', 'KeyH'],
  pause: ['Escape', 'KeyP'],
  map: ['KeyM', 'Tab'],
  camReset: ['KeyC'],
  lookBack: ['KeyB'],
  skip: ['Space', 'KeyE', 'Enter', 'Mouse0'],
  mute: ['KeyN'],
  reset: ['KeyR'],
  giveUp: ['KeyQ'],
  // the title screen's "Spela" / "Fortsätt" (main.js titleKeys; never the mouse)
  begin: ['Enter', 'NumpadEnter', 'Space', 'KeyE'],
};
// Standard gamepad layout: A jump / handbrake, B report (hold) and give up (after a failed mission),
// X kick, Y interact, LB or L3 brisk walk (L3 is the horn in a car, as is RB), R3 look back, Back
// map, Start pause; on the title A, Y or Start begin.
const PAD = { jump: [0], handbrake: [0], report: [1], giveUp: [1], sprint: [4, 10], attack: [2], interact: [3], horn: [10, 5], pause: [9], map: [8], skip: [0, 3], lookBack: [11], begin: [0, 3, 9] };
const finite = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const dz = (a) => { a = finite(a); return Math.abs(a) < 0.15 ? 0 : a < -1 ? -1 : a > 1 ? 1 : a; };

export const input = {
  locked: false,
  canvas: null,
  onUnlock: null,
  playing: false,   // main.js start(): the title is gone (see the keydown handler)

  init(canvas) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      // In the game Space, Tab (the map) and the arrows are ours. On the title they keep their
      // browser meaning: Tab walks the buttons, Space / Enter press the focused one.
      if (this.playing && ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat) pressed.add(e.code);
      down.add(e.code);
    });
    window.addEventListener('keyup', (e) => down.delete(e.code));
    window.addEventListener('blur', () => down.clear());
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { mdx += e.movementX; mdy += e.movementY; }
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked && this.wantLock) { this.lock(); return; }
      pressed.add('Mouse' + e.button);
      down.add('Mouse' + e.button);
    });
    window.addEventListener('mouseup', (e) => down.delete('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  },

  wantLock: false,
  lock() {
    if (this.canvas.requestPointerLock && !this.locked) {
      // Refused outside a user gesture (e.g. a resume by Esc) or right after the user left the
      // lock: no matter, the next click on the canvas asks again. Never an unhandled rejection.
      const quiet = (p) => { if (p && p.catch) p.catch(() => {}); };
      try {
        const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch((e) => { if (e?.name === 'NotSupportedError') { try { quiet(this.canvas.requestPointerLock()); } catch (e2) { /* ignored */ } } });
      } catch (e) { /* ignored: some browsers refuse outside a gesture */ }
    }
  },
  unlock() { if (this.locked && document.exitPointerLock) document.exitPointerLock(); },

  // The pad: a connected one with the standard mapping first (Linux lists a laptop's accelerometer
  // or a joystick as a "gamepad" with a non-standard layout), else any connected one. Missing axes
  // and buttons read 0, never undefined (look.y = undefined * 10 was NaN: a NaN camera, black screen).
  poll() {
    let pads = null;
    try { pads = navigator.getGamepads ? navigator.getGamepads() : null; } catch (e) { pads = null; }
    // A non-standard device only counts once one of its buttons has been pressed: an accelerometer
    // (no buttons, axes that never rest at 0) would otherwise steer Ove and spin the camera forever.
    let gp = null;
    if (pads) for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      if (p.mapping === 'standard') { gp = p; break; }
      if (!woken.has(p.index)) { const b = p.buttons || []; for (let k = 0; k < b.length; k++) if (finite(typeof b[k] === 'object' && b[k] ? b[k].value : b[k]) > 0.5) { woken.add(p.index); break; } }
      if (woken.has(p.index)) gp ||= p;
    }
    const t = padPrev; padPrev = padNow; padNow = t;
    padNow.fill(0);
    padAxes[0] = padAxes[1] = padAxes[2] = padAxes[3] = 0;
    padOn = !!gp;
    if (!gp) return;
    const b = gp.buttons || [], a = gp.axes || [];
    for (let i = 0; i < PAD_BUTTONS && i < b.length; i++) { const v = b[i]; padNow[i] = finite(typeof v === 'object' && v ? v.value : v); }
    for (let i = 0; i < 4; i++) padAxes[i] = dz(a[i]);
    if (padNow[6] > 0.05 || padNow[7] > 0.05) padTrig = true;
  },

  key: (code) => down.has(code),
  keyPressed: (code) => pressed.has(code),
  down(action) {
    if (KEYS[action]?.some((k) => down.has(k))) return true;
    return !!PAD[action]?.some((b) => padNow[b] > 0.5);
  },
  pressed(action) { return this.keyPressedAction(action) || this.padPressedAction(action); },
  // The same, from the keyboard (and mouse) only, or from the pad only.
  keyPressedAction(action) { return !!KEYS[action]?.some((k) => pressed.has(k)); },
  padPressedAction(action) { return !!PAD[action]?.some((b) => padNow[b] > 0.5 && !(padPrev[b] > 0.5)); },
  // Movement axes: x = right, y = forward.
  moveX() { return clamp1((down.has('KeyD') || down.has('ArrowRight') ? 1 : 0) - (down.has('KeyA') || down.has('ArrowLeft') ? 1 : 0) + padAxes[0]); },
  moveY() { return clamp1((down.has('KeyW') || down.has('ArrowUp') ? 1 : 0) - (down.has('KeyS') || down.has('ArrowDown') ? 1 : 0) - padAxes[1]); },
  // In a car the triggers are the pedals (RT gas, LT brake). A pad whose triggers never moved
  // (none, or reported as axes) drives with the left stick instead: forward = gas, back = brake.
  throttle() { return Math.max(down.has('KeyW') || down.has('ArrowUp') ? 1 : 0, padNow[7], padOn && !padTrig && padAxes[1] < -0.3 ? -padAxes[1] : 0); },
  brake() { return Math.max(down.has('KeyS') || down.has('ArrowDown') ? 1 : 0, padNow[6], padOn && !padTrig && padAxes[1] > 0.3 ? padAxes[1] : 0); },
  steer() { return this.moveX(); },
  look() {
    _look.x = finite(mdx + padAxes[2] * 14);
    _look.y = finite(mdy + padAxes[3] * 10);
    return _look;
  },
  endFrame() { pressed.clear(); mdx = 0; mdy = 0; },
  // Test hooks: lets the headless driver hold keys without synthesising DOM events.
  _press(code) { pressed.add(code); down.add(code); },
  _release(code) { down.delete(code); },
};

const _look = { x: 0, y: 0 };
function clamp1(v) { return !(v === v) ? 0 : v < -1 ? -1 : v > 1 ? 1 : v; }
