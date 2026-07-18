"use client";

/**
 * Self-contained canvas force-directed asset graph. No external graph library:
 * a small velocity-Verlet simulation (repulsion + link springs + gravity) keeps
 * it dependency-free, fast, and screenshot-ready. Supports pan, zoom, node
 * selection, progressive reveal, and priority/kind coloring.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset, AssetKind, Edge } from "@/lib/types";
import { applyRepulsion } from "@/lib/graph/barnesHut";
import { staleGraphIds } from "@/lib/graph/reconcile";
import { PRIORITY_STYLE } from "@/lib/analysis/priority";

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

const KIND_RADIUS: Partial<Record<AssetKind, number>> = {
  root_domain: 16,
  mail_service: 11,
  cdn: 9,
  third_party: 9,
};
const HIT_GRID_SIZE = 64;

function nodeColor(a: Asset): string {
  if (a.kind === "root_domain") return "#e8edf6";
  return PRIORITY_STYLE[a.priority].color;
}
function nodeRadius(a: Asset): number {
  return KIND_RADIUS[a.kind] ?? 8;
}
function stableAngle(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  return ((hash >>> 0) / 4294967295) * Math.PI * 2;
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
  const spatialRef = useRef<Map<string, Node[]>>(new Map());
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
  const wakeRef = useRef<() => void>(() => {});
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const focusPulseIdRef = useRef(focusPulseId);
  focusPulseIdRef.current = focusPulseId;
  const [, force] = useState(0);
  const hoveredIdRef = useRef<string | null>(null);
  const reducedMotionRef = useRef(false);
  const [hoverInfo, setHoverInfo] = useState<{ id: string; x: number; y: number } | null>(null);

  const edgeList = useMemo(() => edges, [edges]);

  // Sync incoming assets into the simulation node set.
  useEffect(() => {
    const nodes = nodesRef.current;
    const now = performance.now();
    for (const id of staleGraphIds(nodes.keys(), assets.map((asset) => asset.id))) nodes.delete(id);
    const root = assets.find((a) => a.kind === "root_domain");
    for (const a of assets) {
      if (!nodes.has(a.id)) {
        // Spawn near the root (or center) so new nodes fly outward.
        const anchor = root && nodes.get(root.id);
        const angle = stableAngle(a.id);
        nodes.set(a.id, {
          id: a.id,
          x: (anchor?.x ?? 0) + Math.cos(angle) * 40,
          y: (anchor?.y ?? 0) + Math.sin(angle) * 40,
          vx: 0,
          vy: 0.5,
          r: nodeRadius(a),
          asset: a,
          born: now,
        });
      } else {
        nodes.get(a.id)!.asset = a; // refresh (priority may have changed)
      }
    }
    wakeRef.current();
  }, [assets]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let width = 0;
    let height = 0;
    let running = false;
    let settledFrames = 0;

    const resize = () => {
      const dpr = nodesRef.current.size > 500 ? 1 : Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      wakeRef.current();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const step = () => {
      running = false;
      const nodes = [...nodesRef.current.values()];
      const idIndex = new Map(nodes.map((n, i) => [n.id, i] as const));

      // Repulsion. Direct all-pairs (O(n^2)) reads best for small graphs; switch
      // to the Barnes–Hut quadtree (~O(n log n)) once the surface gets large.
      if (nodes.length > 80) {
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
      let maxSpeed = 0;
      for (const n of nodes) {
        n.vx += -n.x * 0.003;
        n.vy += -n.y * 0.003;
        n.vx *= 0.82;
        n.vy *= 0.82;
        const sp = Math.hypot(n.vx, n.vy);
        maxSpeed = Math.max(maxSpeed, sp);
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
      settledFrames = maxSpeed < 0.04 ? settledFrames + 1 : 0;
      if (settledFrames < 20) schedule();
    };

    const schedule = () => {
      if (running || document.hidden) return;
      running = true;
      rafRef.current = requestAnimationFrame(step);
    };
    wakeRef.current = () => { settledFrames = 0; schedule(); };

    const draw = (nodes: Node[]) => {
      const view = viewRef.current;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(width / 2 + view.x, height / 2 + view.y);
      ctx.scale(view.k, view.k);

      const filter = matchIdsRef.current;
      const withLabels = showLabelsRef.current;
      const byId = nodesRef.current;
      const left = (-width / 2 - view.x) / view.k - 80;
      const right = (width / 2 - view.x) / view.k + 80;
      const top = (-height / 2 - view.y) / view.k - 80;
      const bottom = (height / 2 - view.y) / view.k + 80;
      const visible = (node: Node) => node.x >= left && node.x <= right && node.y >= top && node.y <= bottom;
      const spatial = new Map<string, Node[]>();
      for (const node of nodes) {
        const key = `${Math.floor(node.x / HIT_GRID_SIZE)}:${Math.floor(node.y / HIT_GRID_SIZE)}`;
        const cell = spatial.get(key);
        if (cell) cell.push(node); else spatial.set(key, [node]);
      }
      spatialRef.current = spatial;
      // Edges.
      for (const e of edgeList) {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) continue;
        if (!visible(a) && !visible(b)) continue;
        const active = selectedIdRef.current && (e.from === selectedIdRef.current || e.to === selectedIdRef.current);
        const dim = filter && !(filter.has(e.from) && filter.has(e.to));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        const edgeAge = Math.min(1, Math.max(0, (performance.now() - Math.max(a.born, b.born)) / 600));
        ctx.strokeStyle = dim ? "rgba(148,173,214,0.05)" : active ? `rgba(56,225,195,${0.55 * edgeAge})` : `rgba(148,173,214,${0.14 * edgeAge})`;
        ctx.lineWidth = active ? 1.6 : 1;
        ctx.stroke();
      }
      // Nodes.
      const now = performance.now();
      for (const n of nodes) {
        if (!visible(n)) continue;
        const color = nodeColor(n.asset);
        const grow = reducedMotionRef.current ? 1 : Math.min(1, (now - n.born) / 420);
        const r = n.r * (0.4 + 0.6 * grow);
        const isSel = n.id === selectedIdRef.current;
        const isPulse = n.id === focusPulseIdRef.current;
        const isHover = n.id === hoveredIdRef.current;
        const dim = filter && !filter.has(n.id);

        if ((isPulse || isSel || isHover) && !dim) {
          const ring = reducedMotionRef.current ? 0 : (Math.sin(now / 260) + 1) / 2;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 6 + ring * 5, 0, Math.PI * 2);
          ctx.strokeStyle = isPulse ? "rgba(56,225,195,0.5)" : isHover ? "rgba(91,140,255,.55)" : "rgba(255,255,255,0.35)";
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        // Glow.
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.shadowColor = color;
        ctx.shadowBlur = dim || nodes.length > 350 ? 0 : isSel ? 22 : 12;
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
        if (withLabels && !dim && (isSel || isHover || !!filter || (nodes.length <= 400 && (n.r >= 10 || view.k > 1.15)))) {
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
          const pulse = reducedMotionRef.current ? 0 : (Math.sin(now / 320) + 1) / 2;
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

    const onVisibility = () => { if (!document.hidden) wakeRef.current(); };
    document.addEventListener("visibilitychange", onVisibility);
    schedule();
    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      wakeRef.current = () => {};
    };
  }, [edgeList]);

  // Interaction: pan, zoom, click-to-select.
  const toWorld = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const view = viewRef.current;
    const x = (clientX - rect.left - rect.width / 2 - view.x) / view.k;
    const y = (clientY - rect.top - rect.height / 2 - view.y) / view.k;
    return { x, y };
  };

  const hitNode = (x: number, y: number, radius = 18): string | null => {
    const cellX = Math.floor(x / HIT_GRID_SIZE);
    const cellY = Math.floor(y / HIT_GRID_SIZE);
    let hit: string | null = null;
    let best = radius * radius;
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
      for (const node of spatialRef.current.get(`${cellX + dx}:${cellY + dy}`) ?? []) {
        const distance = (node.x - x) ** 2 + (node.y - y) ** 2;
        if (distance < best) { best = distance; hit = node.id; }
      }
    }
    return hit;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragRef.current = { panning: true, lastX: e.clientX, lastY: e.clientY };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.panning) {
      const { x, y } = toWorld(e.clientX, e.clientY);
      const hovered = hitNode(x, y, 24);
      if (hovered !== hoveredIdRef.current) {
        hoveredIdRef.current = hovered;
        setHoverInfo(hovered ? { id: hovered, x: e.clientX, y: e.clientY } : null);
        wakeRef.current();
      } else if (hovered) setHoverInfo({ id: hovered, x: e.clientX, y: e.clientY });
      return;
    }
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 0) {
      autoFitRef.current = false; // user took manual control
      viewRef.current.x += dx;
      viewRef.current.y += dy;
      wakeRef.current();
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const moved = Math.abs(e.clientX - dragRef.current.lastX);
    dragRef.current.panning = false;
    // Treat as click: hit test nearest node.
    const { x, y } = toWorld(e.clientX, e.clientY);
    const hit = hitNode(x, y);
    onSelect(hit);
    wakeRef.current();
    force((v) => v + 1);
    void moved;
  };
  const onWheel = (e: React.WheelEvent) => {
    autoFitRef.current = false; // user took manual control
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    viewRef.current.k = Math.max(0.4, Math.min(3.5, viewRef.current.k * factor));
    wakeRef.current();
  };

  const zoomBy = (factor: number) => {
    autoFitRef.current = false;
    viewRef.current.k = Math.max(0.4, Math.min(3.5, viewRef.current.k * factor));
    wakeRef.current();
  };
  const fitView = () => {
    autoFitRef.current = true;
    wakeRef.current();
  };
  /** Save the current graph view as a PNG, composited over the dark background. */
  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d");
    if (!octx) return;
    octx.fillStyle = "#05070a";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(canvas, 0, 0);
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "outside-graph.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { hoveredIdRef.current = null; setHoverInfo(null); wakeRef.current(); }}
        onWheel={onWheel}
      />
      {hoverInfo && (() => { const asset = nodesRef.current.get(hoverInfo.id)?.asset; if (!asset) return null; return <div className="pointer-events-none fixed z-[60] max-w-64 -translate-y-[calc(100%+14px)] rounded-xl border border-line bg-base-950/92 px-3 py-2 shadow-panel backdrop-blur-xl" style={{ left: hoverInfo.x + 12, top: hoverInfo.y }}><div className="mono truncate text-[10px] text-ink">{asset.label}</div><div className="mono mt-1 flex items-center gap-2 text-[8px] uppercase text-ink-faint"><span>{asset.kind.replaceAll("_", " ")}</span><span>·</span><span style={{ color: nodeColor(asset) }}>{asset.priority}</span></div><div className="mt-1 text-[9px] text-ink-faint">Click to inspect evidence</div></div>; })()}
      {controls && (
        <div data-capture-hide className="absolute right-3 top-3 flex flex-col gap-1">
          <ControlButton label="Zoom in" onClick={() => zoomBy(1.2)}>+</ControlButton>
          <ControlButton label="Zoom out" onClick={() => zoomBy(0.83)}>−</ControlButton>
          <ControlButton label="Fit to view" onClick={fitView}>⤢</ControlButton>
          <ControlButton label="Export as image" onClick={exportImage}>⤓</ControlButton>
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
