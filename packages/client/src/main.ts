import type { Difficulty } from '@splitfire/bot';
import { MenuScreen } from './menu';
import type { App, PointerInfo, Screen } from './screen';
import { View } from './view';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const view = new View(canvas);

let screen: Screen;
const app: App = {
  show(next: Screen) {
    screen = next;
  },
  menu(difficulty) {
    screen = new MenuScreen(app, difficulty as Difficulty);
  },
};
screen = new MenuScreen(app);

function info(e: PointerEvent): PointerInfo {
  const p = view.toLogical(e.clientX, e.clientY);
  return { id: e.pointerId, x: p.x, y: p.y, button: e.button, isTouch: e.pointerType === 'touch' };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  screen.pointerDown(info(e));
});
canvas.addEventListener('pointermove', (e) => screen.pointerMove(info(e)));
canvas.addEventListener('pointerup', (e) => screen.pointerUp(info(e)));
canvas.addEventListener('pointercancel', (e) => screen.pointerUp({ ...info(e), cancel: true }));
canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const p = view.toLogical(e.clientX, e.clientY);
    screen.wheel(p.x, p.y, e.deltaY);
  },
  { passive: false },
);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault();
  screen.key(e.code);
});

let last = performance.now();
function frame(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  const now = t / 1000;
  screen.update(dt, now);
  const ctx = view.begin();
  screen.draw(ctx, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
