"use client";

/**
 * Self-contained canvas force-directed asset graph. No external graph library:
 * a small velocity-Verlet simulation (repulsion + link springs + gravity) keeps
 * it dependency-free, fast, and screenshot-ready. Supports pan, zoom, node
 * selection, progressive reveal, and priority/kind coloring.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset, AssetKind, Edge, Priority } from "@/lib/types";
import { applyRepulsion } from "@/lib/graph/barnesHut";

interface Node {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  asset: Asset;
  born: number;
}

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: "#ff5b6e",
  high: "#ff8a5b",
  medium: "#f5c451",
  low: "#5b8cff",
  info: "#38e1c3",
};

const KIND_RADIUS: Partial<Record<AssetKind, number>> = {
  root_domain: 16,
  mail_service: 11,
  cdn: 9,
  third_party: 9,
};

function nodeColor(a: Asset): string {
  if (a.kind === "root_domain") return "#e8edf6";
  return PRIORITY_COLOR[a.priority];
}
function nodeRadius(a: Asset): number {
  return KIND_RADIUS[a.kind] ?? 8;
}

export function AssetGraph({
  assets,
  edges,
  selectedId,
  onSelect,
  focusPulseId,
  controls = false,
  showLabels = true,
  matchIds = null,
  changedIds = null,
}: {
  assets: Asset[];
  edges: Edge[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  focusPulseId?: string | null;
  /** Show the fit/zoom controls overlay (main scan & attacker view, not the hero backdrop). */
  controls?: boolean;
  /** Draw node labels (off for the decorative hero backdrop). */
  showLabels?: boolean;
  /** When set, nodes not in the set are dimmed (search / filter highlighting). */
  matchIds?: Set<string> | null;
  /** Nodes that changed since the previous scan, for the change overlay. */
  changedIds?: Map<string, "new" | "returned"> | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Map<string, Node>>(new Map());
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  // Auto-fit keeps the whole graph framed until the user pans/zooms manually.
  const autoFitRef = useRef(true);
  // Read live via refs so search/filter changes don't restart the simulation.
  const matchIdsRef = useRef(matchIds);
  matchIdsRef.current = matchIds;
  const showLabelsRef = useRef(showLabels);
  showLabelsRef.current = showLabels;
  const changedIdsRef = useRef(changedIds);
  changedIdsRef.current = changedIds;
  const dragRef = useRef<{ panning: boolean; lastX: number; lastY: number }>({ panning: false, lastX: 0, lastY: 0 });
  const rafRef = useRef<number>(0);
  const [, force] = useState(0);

  const edgeList = useMemo(() => edges, [edges]);

  // Sync incoming assets into the simulation node set.
  useEffect(() => {
    const nodes = nodesRef.current;
    const now = performance.now();
    const root = assets.find((a) => a.kind === "root_domain");
    for (const a of assets) {
      if (!nodes.has(a.id)) {
        // Spawn near the root (or center) so new nodes fly outward.
        const anchor = root && nodes.get(root.id);
        const angle = Math.random() * Math.PI * 2;
        nodes.set(a.id, {
          id: a.id,
          x: (anchor?.x ?? 0) + Math.cos(angle) * 40,
          y: (anchor?.y ?? 0) + Math.sin(angle) * 40,
          vx: 0,
          vy: 0,
          r: nodeRadius(a),
          asset: a,
          born: now,
        });
      } else {
        nodes.get(a.id)!.asset = a; // refresh (priority may have changed)
      }
    }
  }, [assets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const step = () => {
      const nodes = [...nodesRef.current.values()];
      const idIndex = new Map(nodes.map((n, i) => [n.id, i] as const));

      // Repulsion. Direct all-pairs (O(n^2)) reads best for small graphs; switch
      // to the Barnes–Hut quadtree (~O(n log n)) once the surface gets large.
      if (nodes.length > 140) {
        applyRepulsion(nodes, { strength: 2200, theta: 0.85, maxForce: 26 });
      } else {
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i]!;
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j]!;
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 36) {
              // Floor the distance and jitter coincident nodes so repulsion never
              // explodes when nodes spawn on top of each other.
              const ang = Math.random() * Math.PI * 2;
              dx = Math.cos(ang) * 6;
              dy = Math.sin(ang) * 6;
              d2 = 36;
            }
            const d = Math.sqrt(d2);
            const f = Math.min(2200 / d2, 26); // cap the force
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }
      }
      // Link springs.
      for (const e of edgeList) {
        const ai = idIndex.get(e.from);
        const bi = idIndex.get(e.to);
        if (ai === undefined || bi === undefined) continue;
        const a = nodes[ai]!;
        const b = nodes[bi]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const target = 110;
        const f = (d - target) * 0.015;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
      // Gravity to center + damping + velocity clamp (prevents runaway nodes).
      const MAX_SPEED = 22;
      for (const n of nodes) {
        n.vx += -n.x * 0.003;
        n.vy += -n.y * 0.003;
        n.vx *= 0.82;
        n.vy *= 0.82;
        const sp = Math.hypot(n.vx, n.vy);
        if (sp > MAX_SPEED) {
          n.vx = (n.vx / sp) * MAX_SPEED;
          n.vy = (n.vy / sp) * MAX_SPEED;
        }
        n.x += n.vx;
        n.y += n.vy;
      }

      // Auto-fit: smoothly frame the whole graph in the viewport until the user
      // takes manual control. This guarantees the graph is always on-screen and
      // screenshot-ready regardless of where the simulation settles.
      if (autoFitRef.current && nodes.length > 0 && width > 0 && height > 0) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const n of nodes) {
          minX = Math.min(minX, n.x - n.r);
          maxX = Math.max(maxX, n.x + n.r);
          minY = Math.min(minY, n.y - n.r);
          maxY = Math.max(maxY, n.y + n.r);
        }
        const pad = 90;
        const spanX = Math.max(maxX - minX, 1);
        const spanY = Math.max(maxY - minY, 1);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const targetK = Math.max(0.45, Math.min(1.8, Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY)));
        const view = viewRef.current;
        view.k += (targetK - view.k) * 0.07;
        view.x += (-view.k * cx - view.x) * 0.09;
        view.y += (-view.k * cy - view.y) * 0.09;
      }

      draw(nodes);
      rafRef.current = requestAnimationFrame(step);
    };

    const draw = (nodes: Node[]) => {
      const view = viewRef.current;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2 + view.x, height / 2 + view.y);
      ctx.scale(view.k, view.k);

      const filter = matchIdsRef.current;
      const withLabels = showLabelsRef.current;
      const byId = new Map(nodes.map((n) => [n.id, n] as const));
      // Edges.
      for (const e of edgeList) {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) continue;
        const active = selectedId && (e.from === selectedId || e.to === selectedId);
        const dim = filter && !(filter.has(e.from) && filter.has(e.to));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = dim ? "rgba(148,173,214,0.05)" : active ? "rgba(56,225,195,0.55)" : "rgba(148,173,214,0.14)";
        ctx.lineWidth = active ? 1.6 : 1;
        ctx.stroke();
      }
      // Nodes.
      const now = performance.now();
      for (const n of nodes) {
        const color = nodeColor(n.asset);
        const grow = Math.min(1, (now - n.born) / 420);
        const r = n.r * (0.4 + 0.6 * grow);
        const isSel = n.id === selectedId;
        const isPulse = n.id === focusPulseId;
        const dim = filter && !filter.has(n.id);

        if ((isPulse || isSel) && !dim) {
          const ring = (Math.sin(now / 260) + 1) / 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 6 + ring * 5, 0, Math.PI * 2);
          ctx.strokeStyle = isPulse ? "rgba(56,225,195,0.5)" : "rgba(255,255,255,0.35)";
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        // Glow.
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.shadowColor = color;
        ctx.shadowBlur = dim ? 0 : isSel ? 22 : 12;
        ctx.fillStyle = color;
        ctx.globalAlpha = dim ? 0.12 : 0.25 + 0.75 * grow;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        // Core.
        ctx.globalAlpha = dim ? 0.2 : 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(2, r * 0.5), 0, Math.PI * 2);
        ctx.fillStyle = "#05070a";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(1.4, r * 0.32), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;

        // Label for larger / selected / matched nodes.
        if (withLabels && !dim && (n.r >= 10 || isSel || !!filter || view.k > 1.15)) {
          ctx.font = "11px ui-monospace, monospace";
          ctx.fillStyle = isSel ? "#e8edf6" : "rgba(170,182,204,0.8)";
          ctx.textAlign = "center";
          ctx.fillText(n.asset.label.replace(/\.[a-z]+$/, ""), n.x, n.y + r + 13);
        }

        // Change overlay: distinctive ring + tag for assets that changed since
        // the previous scan (new / returned).
        const change = changedIdsRef.current?.get(n.id);
        if (change && !dim) {
          const c = change === "new" ? "#38e1c3" : "#f5c451";
          const pulse = (Math.sin(now / 320) + 1) / 2;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 7 + pulse * 3, 0, Math.PI * 2);
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
          if (withLabels) {
            ctx.font = "700 9px ui-monospace, monospace";
            ctx.fillStyle = c;
            ctx.textAlign = "center";
            ctx.fillText(change === "new" ? "NEW" : "RETURNED", n.x, n.y - r - 8);
          }
        }
      }
      ctx.restore();
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [edgeList, selectedId, focusPulseId]);

  // Interaction: pan, zoom, click-to-select.
  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    const x = (clientX - rect.left - rect.width / 2 - view.x) / view.k;
    const y = (clientY - rect.top - rect.height / 2 - view.y) / view.k;
    return { x, y };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { panning: true, lastX: e.clientX, lastY: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.panning) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      autoFitRef.current = false; // user took manual control
      viewRef.current.x += dx;
      viewRef.current.y += dy;
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const moved = Math.abs(e.clientX - dragRef.current.lastX);
    dragRef.current.panning = false;
    // Treat as click: hit test nearest node.
    const { x, y } = toWorld(e.clientX, e.clientY);
    let hit: string | null = null;
    let best = 18 * 18;
    for (const n of nodesRef.current.values()) {
      const d2 = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d2 < best) {
        best = d2;
        hit = n.id;
      }
    }
    onSelect(hit);
    force((v) => v + 1);
    void moved;
  };
  const onWheel = (e: React.WheelEvent) => {
    autoFitRef.current = false; // user took manual control
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    viewRef.current.k = Math.max(0.4, Math.min(3.5, viewRef.current.k * factor));
  };

  const zoomBy = (factor: number) => {
    autoFitRef.current = false;
    viewRef.current.k = Math.max(0.4, Math.min(3.5, viewRef.current.k * factor));
  };
  const fitView = () => {
    autoFitRef.current = true;
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
      {controls && (
        <div className="absolute right-3 top-3 flex flex-col gap-1">
          <ControlButton label="Zoom in" onClick={() => zoomBy(1.2)}>+</ControlButton>
          <ControlButton label="Zoom out" onClick={() => zoomBy(0.83)}>−</ControlButton>
          <ControlButton label="Fit to view" onClick={fitView}>⤢</ControlButton>
        </div>
      )}
    </div>
  );
}

function ControlButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="mono flex h-8 w-8 items-center justify-center rounded-md border border-line bg-base-900/70 text-sm text-ink-soft backdrop-blur transition hover:border-signal/40 hover:text-signal"
    >
      {children}
    </button>
  );
}
