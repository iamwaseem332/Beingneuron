/* ==================== LOSS SURFACE + OPTIMIZER CORE ====================
 * Shared math used by the gradient-descent visualizations.
 *
 * The surface is a rotated 2D quadratic bowl (ill-conditioned, like real
 * loss landscapes) plus a mild ridge term:
 *
 *   f(x, z) = 0.5 * (u^2 + 0.15 * v^2) + 0.06 * u^2 * cos(2z)
 *
 * where (u, v) is (x, z) rotated by `tilt`. The 0.15 eigenvalue ratio makes
 * plain gradient descent zig-zag across the valley — exactly the behaviour
 * the visualization is meant to teach.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export const SURFACE_TILT = 0.45;

const COS_T = Math.cos(SURFACE_TILT);
const SIN_T = Math.sin(SURFACE_TILT);

/** Rotate world coords into the surface's principal axes. */
export function toPrincipal(p: Vec2): { u: number; v: number } {
  return { u: p.x * COS_T + p.z * SIN_T, v: -p.x * SIN_T + p.z * COS_T };
}

export const CURVATURE = 0.3;

/** Loss value at a point on the surface. */
export function surfaceLoss(p: Vec2): number {
  const { u, v } = toPrincipal(p);
  const base = CURVATURE * 0.5 * (u * u + 0.15 * v * v);
  const ridge = 0.06 * u * u * Math.cos(2 * p.z);
  return base + ridge;
}

/** Analytic gradient (df/dx, df/dz) — no finite differences needed. */
export function surfaceGradient(p: Vec2): Vec2 {
  const { u, v } = toPrincipal(p);
  // d/du [ C*0.5*(u^2 + 0.15 v^2) ] = C*u ; ridge derivative wrt u:
  const dfu = CURVATURE * u + 0.12 * u * Math.cos(2 * p.z);
  const dfv = CURVATURE * 0.15 * v;
  // Back-rotate to world frame, plus ridge's explicit z dependence:
  const dfx = dfu * COS_T - dfv * SIN_T;
  const dfz = dfu * SIN_T + dfv * COS_T - 0.12 * u * u * Math.sin(2 * p.z);
  return { x: dfx, z: dfz };
}

export type OptimizerKind = "gd" | "momentum" | "nesterov" | "rmsprop" | "adam";

export interface OptimizerState {
  kind: OptimizerKind;
  pos: Vec2;
  vel: Vec2;
  g: Vec2;
  /** AdaGrad-style accumulators (used by RMSProp / Adam). */
  cacheX: number;
  cacheZ: number;
  mX: number;
  mZ: number;
  vXX: number;
  vZZ: number;
  t: number;
  lr: number;
  momentum: number;
  converged: boolean;
}

export function createOptimizer(kind: OptimizerKind, start: Vec2, lr = 0.1): OptimizerState {
  return {
    kind,
    pos: { ...start },
    vel: { x: 0, z: 0 },
    g: { x: 0, z: 0 },
    cacheX: 0,
    cacheZ: 0,
    mX: 0,
    mZ: 0,
    vXX: 0,
    vZZ: 0,
    t: 0,
    lr,
    momentum: 0.9,
    converged: false,
  };
}

const BETA1 = 0.9;
const BETA2 = 0.999;
const EPS = 1e-8;

/** Advance one optimization step in place. Returns true if still moving. */
export function optimizerStep(s: OptimizerState): boolean {
  s.t += 1;
  const g = surfaceGradient(s.pos);
  s.g = g;
  const lr = s.lr;

  switch (s.kind) {
    case "gd": {
      s.vel.x = -lr * g.x;
      s.vel.z = -lr * g.z;
      break;
    }
    case "momentum": {
      s.vel.x = s.momentum * s.vel.x - lr * g.x;
      s.vel.z = s.momentum * s.vel.z - lr * g.z;
      break;
    }
    case "nesterov": {
      const ahead: Vec2 = {
        x: s.pos.x + s.momentum * s.vel.x,
        z: s.pos.z + s.momentum * s.vel.z,
      };
      const ga = surfaceGradient(ahead);
      s.g = ga;
      s.vel.x = s.momentum * s.vel.x - lr * ga.x;
      s.vel.z = s.momentum * s.vel.z - lr * ga.z;
      break;
    }
    case "rmsprop": {
      const DECAY = 0.99;
      s.cacheX = DECAY * s.cacheX + (1 - DECAY) * g.x * g.x;
      s.cacheZ = DECAY * s.cacheZ + (1 - DECAY) * g.z * g.z;
      s.vel.x = (-lr * g.x) / (Math.sqrt(s.cacheX) + EPS);
      s.vel.z = (-lr * g.z) / (Math.sqrt(s.cacheZ) + EPS);
      break;
    }
    case "adam": {
      s.mX = BETA1 * s.mX + (1 - BETA1) * g.x;
      s.mZ = BETA1 * s.mZ + (1 - BETA1) * g.z;
      s.vXX = BETA2 * s.vXX + (1 - BETA2) * g.x * g.x;
      s.vZZ = BETA2 * s.vZZ + (1 - BETA2) * g.z * g.z;
      const mHatX = s.mX / (1 - Math.pow(BETA1, s.t));
      const mHatZ = s.mZ / (1 - Math.pow(BETA1, s.t));
      const vHatX = s.vXX / (1 - Math.pow(BETA2, s.t));
      const vHatZ = s.vZZ / (1 - Math.pow(BETA2, s.t));
      s.vel.x = (-lr * mHatX) / (Math.sqrt(vHatX) + EPS);
      s.vel.z = (-lr * mHatZ) / (Math.sqrt(vHatZ) + EPS);
      break;
    }
  }

  s.pos.x += s.vel.x;
  s.pos.z += s.vel.z;

  const speed = Math.hypot(s.vel.x, s.vel.z);
  const gradNorm = Math.hypot(g.x, g.z);
  s.converged = speed < 1e-4 && gradNorm < 5e-3;
  return !s.converged;
}

export interface RunResult {
  trajectory: Vec2[];
  losses: number[];
  iterations: number;
  converged: boolean;
  finalLoss: number;
}

/** Pre-compute an entire optimization run (used for reduced-motion mode). */
export function simulateRun(
  kind: OptimizerKind,
  start: Vec2,
  lr: number,
  maxSteps = 300
): RunResult {
  const s = createOptimizer(kind, start, lr);
  const trajectory: Vec2[] = [{ ...start }];
  const losses: number[] = [surfaceLoss(start)];
  let i = 0;
  while (i < maxSteps && optimizerStep(s)) {
    trajectory.push({ ...s.pos });
    losses.push(surfaceLoss(s.pos));
    i++;
  }
  trajectory.push({ ...s.pos });
  losses.push(surfaceLoss(s.pos));
  return {
    trajectory,
    losses,
    iterations: i,
    converged: s.converged,
    finalLoss: surfaceLoss(s.pos),
  };
}
