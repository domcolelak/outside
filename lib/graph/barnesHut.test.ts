import { describe, expect, it } from "vitest";
import { applyRepulsion, type Body } from "./barnesHut";

/** Reference O(n^2) repulsion matching the direct path in AssetGraph. */
function directRepulsion(bodies: Body[], strength = 2200, maxForce = 26): Body[] {
  const out = bodies.map((b) => ({ ...b }));
  for (let i = 0; i < out.length; i++) {
    for (let j = i + 1; j < out.length; j++) {
      const a = out[i]!, b = out[j]!;
      let dx = a.x - b.x, dy = a.y - b.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 36) d2 = 36;
      const d = Math.sqrt(d2);
      const f = Math.min(strength / d2, maxForce);
      a.vx += (dx / d) * f; a.vy += (dy / d) * f;
      b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
    }
  }
  return out;
}

describe("Barnes–Hut repulsion", () => {
  it("approximates the direct all-pairs sum within tolerance", () => {
    // Deterministic spread of bodies.
    const bodies: Body[] = [];
    let seed = 42;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (let i = 0; i < 200; i++) bodies.push({ x: rand() * 1000 - 500, y: rand() * 1000 - 500, vx: 0, vy: 0 });

    const direct = directRepulsion(bodies.map((b) => ({ ...b })));
    const bh = bodies.map((b) => ({ ...b }));
    applyRepulsion(bh, { strength: 2200, theta: 0.5, maxForce: 26 });

    // Mean angular/magnitude agreement: net force direction should broadly match.
    let close = 0;
    for (let i = 0; i < bh.length; i++) {
      const dm = Math.hypot(direct[i]!.vx, direct[i]!.vy);
      const bm = Math.hypot(bh[i]!.vx, bh[i]!.vy);
      if (dm < 0.01 && bm < 0.01) { close++; continue; }
      const dot = direct[i]!.vx * bh[i]!.vx + direct[i]!.vy * bh[i]!.vy;
      const cos = dot / ((dm || 1) * (bm || 1));
      if (cos > 0.9) close++; // same general direction
    }
    expect(close / bh.length).toBeGreaterThan(0.85);
  });

  it("is a no-op for fewer than two bodies", () => {
    const one: Body[] = [{ x: 1, y: 1, vx: 0, vy: 0 }];
    applyRepulsion(one);
    expect(one[0]).toEqual({ x: 1, y: 1, vx: 0, vy: 0 });
  });

  it("pushes two nearby bodies apart in opposite directions", () => {
    const two: Body[] = [{ x: -5, y: 0, vx: 0, vy: 0 }, { x: 5, y: 0, vx: 0, vy: 0 }];
    applyRepulsion(two);
    expect(two[0]!.vx).toBeLessThan(0); // left body pushed left
    expect(two[1]!.vx).toBeGreaterThan(0); // right body pushed right
  });

  it("keeps a 1,000-node simulation step within an interactive CPU budget", () => {
    const bodies: Body[] = Array.from({ length: 1000 }, (_, index) => ({
      x: (index % 40) * 17 + (index % 7),
      y: Math.floor(index / 40) * 19 + (index % 11),
      vx: 0,
      vy: 0,
    }));
    const started = performance.now();
    applyRepulsion(bodies, { theta: 0.85 });
    // Deliberately generous for shared CI runners. This catches accidental
    // O(n^2) regressions without treating a microbenchmark as a product SLA.
    expect(performance.now() - started).toBeLessThan(750);
    expect(bodies.some((body) => body.vx !== 0 || body.vy !== 0)).toBe(true);
  });
});
