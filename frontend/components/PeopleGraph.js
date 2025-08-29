// frontend/components/PeopleGraph.js
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:4000";
const dashId = (pid12) => String(pid12 || "").replace(/(\d{3})(?=\d)/g, "$1-");
const hostFromUrl = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/**
 * Props:
 * - projectPublicId: 12-digit id (no dashes)
 * - maxWidth / maxHeight: box size on the page (defaults below)
 *   We will scale DOWN to fit this box; never scale up.
 */
export default function PeopleGraph({
  projectPublicId,
  maxWidth = 980,
  maxHeight = 420,
}) {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [depth, setDepth] = useState(1);   // how far to expand the network
  const router = useRouter();
  // fetch data (whatever endpoint you wired earlier)
// fetch + build recursively up to `depth`
// (follows outgoing refs to the RIGHT and incoming refs to the LEFT)
useEffect(() => {
  let alive = true;

  async function fetchProjectByPublicId(pubId) {
    const dashed = dashId(pubId);
    const res = await fetch(`${API_BASE}/api/projects/${dashed}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Failed to load project");
    return data;
  }

  async function build() {
    setLoading(true);
    setErr("");

    try {
      const root = await fetchProjectByPublicId(projectPublicId);

      // ----- containers -----
      const nodeMap = new Map();            // key -> node meta
      const layerBuckets = {};              // "out:1" -> [keys], "in:2" -> [...]
      const edges = [];
      let inIdx = 0, outIdx = 0;            // for nice “fan” spacing in your path code

      // helpers
      const ensureBucket = (side, d) => {
        const k = `${side}:${d}`;
        if (!layerBuckets[k]) layerBuckets[k] = [];
        return layerBuckets[k];
      };

      const addProjectNode = (pubId, title, side, d) => {
        const key = `P:${pubId}`;
        if (!nodeMap.has(key)) {
          nodeMap.set(key, {
            key,
            id: key === `P:${root.public_id}` ? "CENTER" : pubId,
            label: (title || dashId(pubId)),
            type: "project",
            public_id: pubId,
            side, depth: d,
            href: `/projects/${dashId(pubId)}`
          });
          if (key !== `P:${root.public_id}`) ensureBucket(side, d).push(key);
        }
        return key;
      };

      const addExternalNode = (url, text, side, d) => {
        const key = `U:${url}`;
        if (!nodeMap.has(key)) {
          nodeMap.set(key, {
            key,
            id: `URL:${url}`,
            label: (text || hostFromUrl(url) || "external"),
            type: "external",
            ref_url: url,
            side, depth: d,
            href: url
          });
          ensureBucket(side, d).push(key);
        }
        return key;
      };

      // seed center node (label = PROJECT TITLE)
      nodeMap.set(`P:${root.public_id}`, {
        key: `P:${root.public_id}`,
        id: "CENTER",
        label: root.title || dashId(root.public_id),
        type: "project",
        public_id: root.public_id,
        center: true,
        href: `/projects/${dashId(root.public_id)}`
      });

      // fan-out helpers (depth-aware)
      function addOut(project, d) {
        const arr = Array.isArray(project.references_to) ? project.references_to : [];
        for (const r of arr) {
          if (r.dst_public_id) {
            // internal → RIGHT
            addProjectNode(r.dst_public_id, r.dst_title, "out", d);
            edges.push({
              from: (project.public_id === root.public_id && d === 1) ? "CENTER" : project.public_id,
              to: r.dst_public_id,
              side: "out",
              i: outIdx++
            });
            if (d < depth) q.push({ pubId: r.dst_public_id, side: "out", depth: d + 1 });
          } else if (r.ref_url) {
            // external
            const text = (r.ref_desc && r.ref_desc.trim()) || hostFromUrl(r.ref_url) || r.ref_url;
            addExternalNode(r.ref_url, text, "out", d);
            edges.push({
              from: (project.public_id === root.public_id && d === 1) ? "CENTER" : project.public_id,
              to: `URL:${r.ref_url}`,
              side: "out",
              i: outIdx++
            });
          }
        }
      }

      function addIn(project, d) {
        const arr = Array.isArray(project.references_by) ? project.references_by : [];
        for (const r of arr) {
          if (r.src_public_id) {
            // internal → LEFT
            addProjectNode(r.src_public_id, r.src_title, "in", d);
            edges.push({
              from: r.src_public_id,
              to: (project.public_id === root.public_id && d === 1) ? "CENTER" : project.public_id,
              side: "in",
              i: inIdx++
            });
            if (d < depth) q.push({ pubId: r.src_public_id, side: "in", depth: d + 1 });
          }
        }
      }

      // initial neighbors (depth = 1)
      const q = [];
      addOut(root, 1);
      addIn(root, 1);

      // BFS by side, depth
      const seen = new Set([`root:${root.public_id}`]);
      while (q.length) {
        const { pubId, side, depth: d } = q.shift();
        const key = `${side}:${pubId}:${d}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const p = await fetchProjectByPublicId(pubId);
        addProjectNode(p.public_id, p.title, side, d); // ensure exists
        if (side === "out") addOut(p, d);
        else addIn(p, d);
      }

      // ----- compute positions for buckets -----
      const nodes = [];
      // center
      const center = nodeMap.get(`P:${root.public_id}`);
      nodes.push({ id: "CENTER", label: center.label, x: CENTER_X, y: CENTER_Y, center: true, href: center.href });

      const placeLayer = (side, d) => {
        const arrKeys = layerBuckets[`${side}:${d}`] || [];
        const n = arrKeys.length;
        for (let i = 0; i < n; i++) {
          const meta = nodeMap.get(arrKeys[i]);
          const y = CENTER_Y - ((n - 1) * GAP_Y) / 2 + i * GAP_Y;
          const x = side === "out"
            ? (CENTER_X + d * GAP_X)
            : (CENTER_X - (d * GAP_X + nodeW));
          const id = meta.type === "project" ? meta.public_id : `URL:${meta.ref_url}`;
          nodes.push({ id, label: meta.label, x, y, center: false, href: meta.href });
        }
      };
      for (let d = 1; d <= depth; d++) { placeLayer("in", d); placeLayer("out", d); }

      if (alive) setGraph({ nodes, edges });
    } catch (e) {
      if (alive) setErr(e.message || "Failed to load graph");
    } finally {
      if (alive) setLoading(false);
    }
  }

  build();
  return () => { alive = false; };
}, [projectPublicId, depth]);



  // compute the natural bounds of the drawn content
// sizes & layout (used by both layout and renderer)
const nodeW = 140;
const nodeH = 36;
const pad   = 40;

// simple layout parameters
const GAP_X    = 200;   // horizontal gap between columns
const GAP_Y    = 64;    // vertical gap between stacked nodes
const CENTER_X = 460;   // where the center node sits
const CENTER_Y = 180;


  const bounds = useMemo(() => {
    if (!graph.nodes.length) return { minX: 0, minY: 0, width: 800, height: 260 };
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of graph.nodes) {
      const x = n.x ?? 0;
      const y = n.y ?? 0;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + nodeW);
      maxY = Math.max(maxY, y + nodeH);
    }
    // padding around the content
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  }, [graph.nodes]);

  // measure the container (for responsive down-scaling)
  const boxRef = useRef(null);
  const [boxSize, setBoxSize] = useState({ w: maxWidth, h: maxHeight });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBoxSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // scale DOWN only
  const scale = useMemo(() => {
    const sx = boxSize.w / bounds.width;
    const sy = boxSize.h / bounds.height;
    return Math.min(1, sx, sy);
  }, [boxSize, bounds]);

  // center the scaled drawing inside the box
  const offset = useMemo(() => {
    const drawW = bounds.width * scale;
    const drawH = bounds.height * scale;
    return {
      x: (boxSize.w - drawW) / 2,
      y: (boxSize.h - drawH) / 2,
    };
  }, [boxSize, bounds, scale]);

  if (loading) {
    return (
      <div
        ref={boxRef}
        style={{
          height: maxHeight,
          maxWidth: "100%",
          background: "#0b1220",
          borderRadius: 12,
          border: "1px solid var(--line)",
          display: "grid",
          placeItems: "center",
        }}
      >
        Loading…
      </div>
    );
  }
  if (err) {
    return (
      <div
        ref={boxRef}
        style={{
          height: maxHeight,
          maxWidth: "100%",
          background: "#0b1220",
          borderRadius: 12,
          border: "1px solid var(--line)",
          color: "#ffb4b4",
          display: "grid",
          placeItems: "center",
        }}
      >
        {err}
      </div>
    );
  }

  return (
    <div
      ref={boxRef}
      style={{
        width: "100%",
        maxWidth: "100%",
        height: maxHeight,
        background: "#0b1220",
        borderRadius: 12,
        border: "1px solid var(--line)",
        overflow: "hidden",
        position: "relative",
      }}
    >
  {/* Depth selector */}
  <div
    style={{
      position: "absolute",
      right: 8,
      top: 8,
      zIndex: 2,
      background: "rgba(255,255,255,.06)",
      border: "1px solid var(--line)",
      padding: "6px 8px",
      borderRadius: 8
    }}
  >
    <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12 }}>
      Depth
      <input
        type="number"
        min={1}
        max={6}
        value={depth}
        onChange={(e) => setDepth(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
        style={{
          width: 56,
          border: "1px solid var(--line)",
          background: "var(--input-bg)",
          color: "var(--text)",
          borderRadius: 6,
          padding: "2px 6px"
        }}
      />
    </label>
  </div>

      {/* We render the natural-size SVG and scale DOWN via CSS */}
<svg
  viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
  width="100%"
  height="100%"
  preserveAspectRatio="xMidYMid meet"
  style={{
    position: "absolute",
    left: 0,
    top: 0,
  }}
>

        {/* === YOUR EXISTING DRAWING LOGIC GOES HERE ===
            Keep your algorithm exactly as-is; just draw using n.x/n.y.
            The example below draws rounded rectangles + arrows.
        */}
        <defs>
<marker
  id="arrow"
  viewBox="0 0 14 14"
  refX="13"        // how far the arrow tip sits from the end of the path
  refY="7"
  markerWidth="14" // fixed size in user space
  markerHeight="14"
  markerUnits="userSpaceOnUse"   // <<< prevents scaling with stroke width
  orient="auto"
>
  <path d="M 0 0 L 14 7 L 0 14 z" fill="#607eaa" opacity="0.8" />
</marker>

          <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.35" />
          </filter>
        </defs>












{/* edges */}
{(() => {
  const inCount  = Math.max(1, graph.edges.filter(e => e.side === "in").length);
  const outCount = Math.max(1, graph.edges.filter(e => e.side === "out").length);

  const BEND = 80;    // how much curves bend horizontally
  const FAN  = 26;    // how far we fan edges vertically

  return graph.edges.map((e, idx) => {
    const from = graph.nodes.find(n => n.id === e.from);
    const to   = graph.nodes.find(n => n.id === e.to);
    if (!from || !to) return null;

    const x1 = (from.x ?? 0) + (e.side === "in" ? nodeW : 0);
    const y1 = (from.y ?? 0) + nodeH / 2;
    const x2 = (to.x   ?? 0) + (e.side === "out" ? 0 : nodeW);
    const y2 = (to.y   ?? 0) + nodeH / 2;

    // index-centered vertical offset for fanning
    const i     = e.i ?? 0;
    const total = e.side === "out" ? outCount : inCount;
    const offs  = (i - (total - 1) / 2) * FAN;

    // bezier control points: bend horizontally, fan vertically near the center
    const c1x = x1 + (e.side === "in" ? BEND : BEND);
    const c2x = x2 - (e.side === "out" ? BEND : BEND);
    const c1y = y1 + (e.side === "out" ? offs : 0);
    const c2y = y2 + (e.side === "in"  ? offs : 0);

    const d = `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;

    return (
      <path
        key={idx}
        d={d}
        stroke="#6b85a6"
        strokeWidth="5"
        strokeLinecap="round"
        opacity="0.40"
        fill="none"
        markerEnd="url(#arrow)"
        style={{ mixBlendMode: "screen" }}  // prevent darkening where curves overlap
      />
    );
  });
})()}





        {/* nodes */}
        {graph.nodes.map((n) => {
          const x = n.x ?? 0;
          const y = n.y ?? 0;
          const isCenter = !!n.center;
          return (
            <g
  key={n.id}
  transform={`translate(${x},${y})`}
  filter="url(#shadow)"
  onClick={() => {
    if (n.href) {
      if (n.href.startsWith("/projects/")) router.push(n.href);
      else window.open(n.href, "_blank");
    }
  }}
  style={{ cursor: n.href ? "pointer" : "default" }}
>

              <rect
                rx="12"
                ry="12"
                width={nodeW}
                height={nodeH}
                fill={isCenter ? "#e23b49" : n.color || "#66aad0"}
                stroke="rgba(255,255,255,.08)"
              />
              <text
                x={nodeW / 2}
                y={nodeH / 2 + 4}
                textAnchor="middle"
                fill="#fff"
                fontSize="13"
                fontWeight={600}
                style={{ userSelect: "none" }}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
