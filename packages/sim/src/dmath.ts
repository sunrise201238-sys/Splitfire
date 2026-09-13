// Deterministic math helpers.
//
// The simulation must produce bit-identical results on every JavaScript engine so that
// two clients running the same inputs stay in lockstep. Basic IEEE-754 arithmetic
// (+ - * /), Math.sqrt and Math.floor are correctly rounded everywhere; Math.sin,
// Math.cos, Math.atan2 and Math.pow are not, so the simulation never calls them.

export const PI = 3.141592653589793;
export const TWO_PI = 6.283185307179586;
export const HALF_PI = 1.5707963267948966;

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function len(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Reduce an angle to [-PI, PI). */
function reduce(a: number): number {
  return a - TWO_PI * Math.floor((a + PI) / TWO_PI);
}

/** Deterministic sine. Polynomial after range reduction; abs error below 1e-7. */
export function dsin(a: number): number {
  let x = reduce(a);
  if (x > HALF_PI) x = PI - x;
  else if (x < -HALF_PI) x = -PI - x;
  const x2 = x * x;
  return (
    x *
    (1 +
      x2 *
        (-1 / 6 +
          x2 *
            (1 / 120 +
              x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800 + x2 * (1 / 6227020800)))))))
  );
}

/** Deterministic cosine. */
export function dcos(a: number): number {
  return dsin(a + HALF_PI);
}

export interface Vec2 {
  x: number;
  y: number;
}

/** Rotate a vector by an angle (radians, screen coordinates: positive is clockwise). */
export function rotate(vx: number, vy: number, a: number): Vec2 {
  const c = dcos(a);
  const s = dsin(a);
  return { x: vx * c - vy * s, y: vx * s + vy * c };
}
