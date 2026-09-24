// Keyboard + mouse state. `down` is held, `hit` is pressed this frame.
const BLOCK_DEFAULT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.locked = false;
    this.onLockChange = null;

    addEventListener('keydown', (e) => {
      if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousedown', (e) => {
      this.keys.add('Mouse' + e.button);
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => this.keys.delete('Mouse' + e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      // Pointer lock gives unlimited turning; without it, plain mouse movement still steers the camera.
      this.dx += e.movementX || 0;
      this.dy += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.onLockChange?.(this.locked);
    });
    addEventListener('blur', () => this.keys.clear());
  }

  lock() {
    try {
      const p = this.canvas.requestPointerLock?.();
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* pointer lock unavailable; arrow keys still turn the camera */ }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  down(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }

  endFrame() {
    this.pressed.clear();
    this.dx = 0;
    this.dy = 0;
  }
}
