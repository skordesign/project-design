"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Position,
  useInternalNode,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";

import { Z, type FlowEdge } from "@/components/designer/to-flow";
import type { EdgeKind } from "@/lib/design/schema";

/** Each kind has its own colour; dashes tell structural, data and async links apart. */
const STYLE: Record<EdgeKind, { stroke: string; width: number; dash?: string }> = {
  depends_on: { stroke: "#94a3b8", width: 1.5, dash: "6 4" },
  calls: { stroke: "#0ea5e9", width: 1.5 },
  exposes: { stroke: "#8b5cf6", width: 2.5 },
  accesses: { stroke: "#10b981", width: 1.5, dash: "2 4" },
  publishes: { stroke: "#f97316", width: 1.5, dash: "5" },
  subscribes: { stroke: "#f97316", width: 1.5, dash: "5" },
  uses: { stroke: "#ec4899", width: 1.5 },
  relation: { stroke: "#f59e0b", width: 1.5 },
  interacts: { stroke: "#14b8a6", width: 1.25 },
  drives: { stroke: "#f43f5e", width: 1.5, dash: "6 4" },
  produces: { stroke: "#84cc16", width: 1.75 },
  consumes: { stroke: "#ef4444", width: 1.75 },
  triggers: { stroke: "#f59e0b", width: 1.5, dash: "5" },
  modifies: { stroke: "#d946ef", width: 1.5, dash: "2 4" },
};

const VIOLATION = "#ef4444";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const boxOf = (n: InternalNode): Box => ({
  x: n.internals.positionAbsolute.x,
  y: n.internals.positionAbsolute.y,
  w: n.measured.width ?? 1,
  h: n.measured.height ?? 1,
});

/** Where the line between the two borders leaves `from`'s border, and which side that is. */
function borderPoint(from: Box, to: Box): { x: number; y: number; position: Position } {
  const cx = from.x + from.w / 2;
  const cy = from.y + from.h / 2;
  const toCx = to.x + to.w / 2;
  const toCy = to.y + to.h / 2;
  const dx = toCx - cx;
  const dy = toCy - cy;

  // 1. If 'to' is clearly to the right of 'from' (distinct columns), always attach Right -> Left
  if (to.x >= from.x + from.w - 12) {
    return {
      x: from.x + from.w,
      y: cy,
      position: Position.Right,
    };
  }

  // 2. If 'to' is clearly to the left of 'from', always attach Left -> Right
  if (from.x >= to.x + to.w - 12) {
    return {
      x: from.x,
      y: cy,
      position: Position.Left,
    };
  }

  // 3. If 'to' is below 'from' and their horizontal spans overlap
  if (to.y >= from.y + from.h - 12) {
    const overlapMinX = Math.max(from.x, to.x);
    const overlapMaxX = Math.min(from.x + from.w, to.x + to.w);
    const clampX = overlapMinX < overlapMaxX ? (overlapMinX + overlapMaxX) / 2 : cx;
    return {
      x: clampX,
      y: from.y + from.h,
      position: Position.Bottom,
    };
  }

  // 4. If 'to' is above 'from' and their horizontal spans overlap
  if (from.y >= to.y + to.h - 12) {
    const overlapMinX = Math.max(from.x, to.x);
    const overlapMaxX = Math.min(from.x + from.w, to.x + to.w);
    const clampX = overlapMinX < overlapMaxX ? (overlapMinX + overlapMaxX) / 2 : cx;
    return {
      x: clampX,
      y: from.y,
      position: Position.Top,
    };
  }

  // 5. Fallback for overlapping or nested boxes: ray intersection
  const w = from.w / 2;
  const h = from.h / 2;
  const scale = 1 / Math.max(Math.abs(dx) / w, Math.abs(dy) / h, 1e-6);
  const x = cx + dx * scale;
  const y = cy + dy * scale;
  const position =
    Math.abs(dx) / w > Math.abs(dy) / h
      ? dx > 0
        ? Position.Right
        : Position.Left
      : dy > 0
        ? Position.Bottom
        : Position.Top;
  return { x, y, position };
}

/** A "floating" smooth-step edge: it attaches to the nearest border, not to a fixed handle. */
export function DesignEdgeView({ id, source, target, data, selected }: EdgeProps<FlowEdge>) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  if (!sourceNode || !targetNode || !data) return null;

  const a = boxOf(sourceNode);
  const b = boxOf(targetNode);
  const from = borderPoint(a, b);
  const to = borderPoint(b, a);

  // Stagger vertical and horizontal bends across parallel channels so multi-edges don't overlap into a thick blob
  let centerX: number | undefined;
  let centerY: number | undefined;

  if (from.position === Position.Right && to.position === Position.Left) {
    const gap = to.x - from.x;
    const dy = to.y - from.y;
    if (gap >= 60 && Math.abs(dy) >= 20) {
      // Bends further away turn closer to source (inner tracks), creating clean nested parallel lines
      const row = Math.min(8, Math.max(1, Math.round(Math.abs(dy) / 90)));
      const fraction = 0.22 + (1 - row / 8) * 0.56;
      centerX = from.x + gap * fraction;
    }
  } else if (from.position === Position.Left && to.position === Position.Right) {
    const gap = from.x - to.x;
    const dy = to.y - from.y;
    if (gap >= 60 && Math.abs(dy) >= 20) {
      const row = Math.min(8, Math.max(1, Math.round(Math.abs(dy) / 90)));
      const fraction = 0.22 + (1 - row / 8) * 0.56;
      centerX = to.x + gap * (1 - fraction);
    }
  } else if (from.position === Position.Bottom && to.position === Position.Top) {
    const gap = to.y - from.y;
    const dx = to.x - from.x;
    if (gap >= 60 && Math.abs(dx) >= 20) {
      const col = Math.min(8, Math.max(1, Math.round(Math.abs(dx) / 120)));
      const fraction = 0.22 + (1 - col / 8) * 0.56;
      centerY = from.y + gap * fraction;
    }
  } else if (from.position === Position.Top && to.position === Position.Bottom) {
    const gap = from.y - to.y;
    const dx = to.x - from.x;
    if (gap >= 60 && Math.abs(dx) >= 20) {
      const col = Math.min(8, Math.max(1, Math.round(Math.abs(dx) / 120)));
      const fraction = 0.22 + (1 - col / 8) * 0.56;
      centerY = to.y + gap * (1 - fraction);
    }
  }

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: from.x,
    sourceY: from.y,
    sourcePosition: from.position,
    targetX: to.x,
    targetY: to.y,
    targetPosition: to.position,
    borderRadius: 8,
    centerX,
    centerY,
  });
  const lifted = data.lifted ?? 0;
  const style = STYLE[data.edge.kind];
  const isDimmed = data.dimmed;
  const isHighlighted = data.highlighted || selected;
  const stroke = isHighlighted ? "var(--primary)" : data.violation ? VIOLATION : style.stroke;
  const strokeWidth = isHighlighted ? style.width + 1.25 : style.width;
  const opacity = isDimmed ? 0.08 : lifted ? 0.55 : 1;
  // Lifted edge ids contain ":", which doesn't belong in a url(#…) reference.
  const marker = `pd-arrow-${id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  return (
    <>
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 1 L9 5 L0 9 z" fill={stroke} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={isDimmed ? undefined : `url(#${marker})`}
        interactionWidth={16}
        style={{
          stroke,
          strokeWidth,
          opacity,
          transition: "opacity 0.2s, stroke-width 0.2s",
          ...(style.dash ? { strokeDasharray: style.dash } : {}),
        }}
      />
      {!isDimmed && (
        <circle
          cx={from.x}
          cy={from.y}
          r={3.5}
          fill={stroke}
          stroke="var(--background)"
          strokeWidth={1.5}
        />
      )}
      {!isDimmed && (
        <EdgeLabelRenderer>
          <div
            title={
              lifted
                ? `${lifted} connection${lifted === 1 ? "" : "s"} from nested components`
                : undefined
            }
            className="nodrag nopan pointer-events-auto absolute rounded-full border bg-background px-2 py-0.5 text-[10px] leading-none font-medium shadow-xs"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              zIndex: isHighlighted ? Z.label + 1 : Z.label,
              borderColor: stroke,
              color: `color-mix(in oklch, ${stroke} 70%, var(--foreground))`,
            }}
          >
            {data.caption}
            {lifted > 1 && ` ×${lifted}`}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const edgeTypes = { design: DesignEdgeView };
