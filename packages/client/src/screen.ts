export interface PointerInfo {
  id: number;
  x: number;
  y: number;
  button: number;
  isTouch: boolean;
  /** True when the browser cancelled the pointer rather than the user releasing it. */
  cancel?: boolean;
}

export interface Screen {
  update(dt: number, now: number): void;
  draw(ctx: CanvasRenderingContext2D, now: number): void;
  pointerDown(p: PointerInfo): void;
  pointerMove(p: PointerInfo): void;
  pointerUp(p: PointerInfo): void;
  wheel(x: number, y: number, deltaY: number): void;
  key(code: string): void;
}

export interface App {
  show(screen: Screen): void;
  /** Return to the main menu, remembering the chosen difficulty. */
  menu(difficulty: string): void;
}
