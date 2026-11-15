import { useCallback, useEffect, useRef } from "react";
import { addEdge, Background, Controls, MarkerType, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Canvas } from "@/types";

const PALETTE = [
  ["client", "Client", "👤"], ["cdn", "CDN", "🌍"], ["lb", "Load Balancer", "⚖️"], ["gateway", "API Gateway", "🚪"],
  ["service", "Service", "⚙️"], ["worker", "Worker", "🛠️"], ["cache", "Cache", "⚡"], ["sql", "SQL DB", "🗄️"],
  ["nosql", "NoSQL DB", "📦"], ["queue", "Queue", "📬"], ["stream", "Stream", "🌊"], ["storage", "Object Storage", "🪣"],
  ["search", "Search Index", "🔎"], ["llm", "LLM", "🧠"], ["vector", "Vector DB", "🧲"], ["agent", "Agent", "🤖"], ["mcp", "MCP Server / Tool", "🔌"],
] as const;
const ICON = Object.fromEntries(PALETTE.map(([k, , i]) => [k, i]));

type NodeData = { kind: string; name: string; label: string };
const mkNode = (id: string, kind: string, name: string, i: number): Node<NodeData> => ({
  id, position: { x: 60 + (i % 4) * 190, y: 40 + Math.floor(i / 4) * 110 },
  data: { kind, name, label: `${ICON[kind] ?? "▫️"} ${name}` }, className: `arch-node k-${kind}`,
});
const EDGE = { markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.6 } };

/** Drag-and-drop architecture board: add components, connect them, name the connections, write your reasoning. */
export function ArchCanvas({ value, onChange, height = 440 }: { value: Canvas; onChange: (c: Canvas) => void; height?: number }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(value.nodes.map((n, i) => mkNode(n.id, n.kind, n.label, i)));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(value.edges.map((e, i) => ({ id: `e${i}`, source: e.from, target: e.to, label: e.label || undefined, ...EDGE })));
  const notes = useRef(value.notes);
  const counter = useRef(value.nodes.length);
  const emit = useRef(onChange); emit.current = onChange;

  useEffect(() => {
    emit.current({
      nodes: nodes.map((n) => ({ id: n.id, kind: n.data.kind, label: n.data.name })),
      edges: edges.map((e) => ({ from: e.source, to: e.target, label: String(e.label ?? "") })),
      notes: notes.current,
    });
  }, [nodes, edges]);

  const onConnect = useCallback((c: Connection) => setEdges((es) => addEdge({ ...c, ...EDGE }, es)), [setEdges]);
  const add = (kind: string, name: string) => setNodes((ns) => [...ns, mkNode(`n${Date.now()}`, kind, name, counter.current++)]);
  const rename = (_: unknown, n: Node<NodeData>) => {
    const name = window.prompt("שם הרכיב (למשל: Orders Service, Redis, Postgres primary)", n.data.name);
    if (name) setNodes((ns) => ns.map((x) => (x.id === n.id ? { ...x, data: { ...x.data, name, label: `${ICON[x.data.kind] ?? "▫️"} ${name}` } } : x)));
  };
  const relabel = (_: unknown, e: Edge) => {
    const label = window.prompt("מה עובר בחיבור הזה? (למשל: HTTPS, async event, read replica)", String(e.label ?? ""));
    if (label != null) setEdges((es) => es.map((x) => (x.id === e.id ? { ...x, label: label || undefined } : x)));
  };

  return (
    <div className="arch">
      <div className="palette">{PALETTE.map(([k, name, icon]) => <button key={k} className="chip" onClick={() => add(k, name)}>{icon} {name}</button>)}</div>
      <div className="arch-board ltr" style={{ height }}>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          onNodeDoubleClick={rename} onEdgeDoubleClick={relabel} fitView fitViewOptions={{ maxZoom: 1 }} deleteKeyCode={["Backspace", "Delete"]}>
          <Background /><Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <small className="muted">לחיצה על רכיב מוסיפה אותו ללוח · גוררים מנקודה לנקודה כדי לחבר · דאבל־קליק משנה שם לרכיב או לחיבור · Delete מוחק את מה שמסומן</small>
      <textarea className="notes" rows={5} defaultValue={value.notes} placeholder="הסבירו את התכנון: הנחות, הערכות קיבולת, למה בחרתם בכל רכיב, מה קורה כשרכיב נופל, trade-offs…"
        onChange={(e) => { notes.current = e.target.value; setNodes((ns) => [...ns]); }} />
    </div>
  );
}

export const emptyCanvas = (): Canvas => ({ nodes: [], edges: [], notes: "" });
export const canvasText = (c: Canvas) =>
  `Components:\n${c.nodes.map((n) => `- ${n.label} [${n.kind}] (${n.id})`).join("\n") || "(none)"}\nConnections:\n${c.edges.map((e) => {
    const name = (id: string) => c.nodes.find((n) => n.id === id)?.label ?? id;
    return `- ${name(e.from)} -> ${name(e.to)}${e.label ? ` (${e.label})` : ""}`;
  }).join("\n") || "(none)"}\nNotes:\n${c.notes || "(none)"}`;
