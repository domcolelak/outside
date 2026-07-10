/**
 * Barnes–Hut approximation for the graph's repulsion force.
 *
 * The direct all-pairs repulsion is O(n²) — fine for the tens–hundreds of nodes
 * a single organization's external surface produces. For very large surfaces
 * (1,000+ nodes) this quadtree brings it to ~O(n log n): distant clusters are
 * approximated by their centre of mass when the cell is small relative to the
 * distance (the `theta` criterion). Pure and unit-tested.
 */

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Cell {
  x0: number;
  y0: number;
  size: number;
  mass: number;
  cx: number; // centre of mass
  cy: number;
  body: Body | null; // leaf body, if exactly one
  children: (Cell | null)[] | null; // NW, NE, SW, SE
}

function makeCell(x0: number, y0: number, size: number): Cell {
  return { x0, y0, size, mass: 0, cx: 0, cy: 0, body: null, children: null };
}

function quadrant(cell: Cell, x: number, y: number): number {
  const midX = cell.x0 + cell.size / 2;
  const midY = cell.y0 + cell.size / 2;
  const east = x >= midX ? 1 : 0;
  const south = y >= midY ? 1 : 0;
  return south * 2 + east; // 0 NW, 1 NE, 2 SW, 3 SE
}

function subCell(cell: Cell, q: number): Cell {
  const half = cell.size / 2;
  const east = q % 2;
  const south = q >= 2 ? 1 : 0;
  return makeCell(cell.x0 + east * half, cell.y0 + south * half, half);
}

function insert(cell: Cell, body: Body, depth = 0): void {
  // Accumulate centre of mass.
  const m = cell.mass + 1;
  cell.cx = (cell.cx * cell.mass + body.x) / m;
  cell.cy = (cell.cy * cell.mass + body.y) / m;
  cell.mass = m;

  if (cell.mass === 1) {
    cell.body = body;
    return;
  }
  if (!cell.children) cell.children = [null, null, null, null];
  // Push an existing leaf body down first.
  if (cell.body) {
    const existing = cell.body;
    cell.body = null;
    if (depth < 24) {
      const q = quadrant(cell, existing.x, existing.y);
      cell.children[q] = cell.children[q] ?? subCell(cell, q);
      insert(cell.children[q]!, existing, depth + 1);
    }
  }
  if (depth < 24) {
    const q = quadrant(cell, body.x, body.y);
    cell.children[q] = cell.children[q] ?? subCell(cell, q);
    insert(cell.children[q]!, body, depth + 1);
  }
}

function force(cell: Cell | null, body: Body, theta: number, strength: number, maxForce: number, acc: { fx: number; fy: number }): void {
  if (!cell || cell.mass === 0) return;
  let dx = body.x - cell.cx;
  let dy = body.y - cell.cy;
  let d2 = dx * dx + dy * dy;

  const isLeaf = cell.body !== null;
  if (isLeaf && cell.body === body) return;

  // Use approximation when the cell is far enough, or it is a single leaf.
  if (isLeaf || (cell.size * cell.size) / d2 < theta * theta) {
    if (d2 < 36) {
      const ang = Math.random() * Math.PI * 2;
      dx = Math.cos(ang) * 6;
      dy = Math.sin(ang) * 6;
      d2 = 36;
    }
    const d = Math.sqrt(d2);
    const f = Math.min((strength * cell.mass) / d2, maxForce * cell.mass);
    acc.fx += (dx / d) * f;
    acc.fy += (dy / d) * f;
    return;
  }
  if (cell.children) for (const c of cell.children) force(c, body, theta, strength, maxForce, acc);
}

export interface RepulsionOptions {
  strength?: number;
  theta?: number;
  maxForce?: number;
}

/** Add Barnes–Hut repulsion into each body's velocity in place. */
export function applyRepulsion(bodies: Body[], opts: RepulsionOptions = {}): void {
  const { strength = 2200, theta = 0.8, maxForce = 26 } = opts;
  if (bodies.length < 2) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of bodies) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x);
    maxY = Math.max(maxY, b.y);
  }
  const size = Math.max(maxX - minX, maxY - minY, 1) + 1;
  const root = makeCell(minX, minY, size);
  for (const b of bodies) insert(root, b);

  for (const b of bodies) {
    const acc = { fx: 0, fy: 0 };
    force(root, b, theta, strength, maxForce, acc);
    b.vx += acc.fx;
    b.vy += acc.fy;
  }
}
