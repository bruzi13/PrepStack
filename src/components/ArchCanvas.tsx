import { useCallback, useEffect, useRef } from "react";
import { addEdge, Background, Controls, MarkerType, ReactFlow, useEdgesState, useNodesState, type Connection, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { ArchitectureCanvas } from "@/domain/records";

/** Components the learner can drop on the board: [kind, default name]. */
const COMPONENT_PALETTE = [
  ["client", "Client"], ["cdn", "CDN"], ["lb", "Load Balancer"], ["gateway", "API Gateway"],
  ["service", "Service"], ["worker", "Worker"], ["cache", "Cache"], ["sql", "SQL DB"],
  ["nosql", "NoSQL DB"], ["queue", "Queue"], ["stream", "Stream"], ["storage", "Object Storage"],
  ["search", "Search Index"], ["llm", "LLM"], ["vector", "Vector DB"], ["agent", "Agent"], ["mcp", "MCP Server / Tool"],
] as const;

const GRID_COLUMNS = 4, COLUMN_WIDTH = 190, ROW_HEIGHT = 110;

type ComponentData = { kind: string; name: string; label: string };

function componentNode(id: string, kind: string, name: string, slot: number): Node<ComponentData> {
  return {
    id,
    position: { x: 60 + (slot % GRID_COLUMNS) * COLUMN_WIDTH, y: 40 + Math.floor(slot / GRID_COLUMNS) * ROW_HEIGHT },
    data: { kind, name, label: name },
    className: `arch-node k-${kind}`,
  };
}

const CONNECTION_STYLE = { markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 1.6 } };

/** Drag-and-drop architecture board: add components, connect them, name the connections, write your reasoning. */
export function ArchCanvas({ value, onChange, height = 440 }: { value: ArchitectureCanvas; onChange: (canvas: ArchitectureCanvas) => void; height?: number }) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ComponentData>>(
    value.nodes.map((component, slot) => componentNode(component.id, component.kind, component.label, slot)),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    value.edges.map((connection, index) => ({ id: `e${index}`, source: connection.from, target: connection.to, label: connection.label || undefined, ...CONNECTION_STYLE })),
  );
  const notes = useRef(value.notes);
  const nextSlot = useRef(value.nodes.length);
  const latestOnChange = useRef(onChange);
  latestOnChange.current = onChange;

  useEffect(() => {
    latestOnChange.current({
      nodes: nodes.map((node) => ({ id: node.id, kind: node.data.kind, label: node.data.name })),
      edges: edges.map((edge) => ({ from: edge.source, to: edge.target, label: String(edge.label ?? "") })),
      notes: notes.current,
    });
  }, [nodes, edges]);

  const connect = useCallback((connection: Connection) => setEdges((current) => addEdge({ ...connection, ...CONNECTION_STYLE }, current)), [setEdges]);
  const addComponent = (kind: string, name: string) => setNodes((current) => [...current, componentNode(`n${Date.now()}`, kind, name, nextSlot.current++)]);

  const renameComponent = (_event: unknown, node: Node<ComponentData>) => {
    const name = window.prompt("שם הרכיב (למשל: Orders Service, Redis, Postgres primary)", node.data.name);
    if (name) setNodes((current) => current.map((existing) => (existing.id === node.id ? { ...existing, data: { ...existing.data, name, label: name } } : existing)));
  };
  const relabelConnection = (_event: unknown, edge: Edge) => {
    const label = window.prompt("מה עובר בחיבור הזה? (למשל: HTTPS, async event, read replica)", String(edge.label ?? ""));
    if (label != null) setEdges((current) => current.map((existing) => (existing.id === edge.id ? { ...existing, label: label || undefined } : existing)));
  };

  return (
    <div className="arch">
      <div className="palette">{COMPONENT_PALETTE.map(([kind, name]) => <button key={kind} className="chip" onClick={() => addComponent(kind, name)}>{name}</button>)}</div>
      <div className="arch-board ltr" style={{ height }}>
        <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={connect}
          onNodeDoubleClick={renameComponent} onEdgeDoubleClick={relabelConnection} fitView fitViewOptions={{ maxZoom: 1 }} deleteKeyCode={["Backspace", "Delete"]}>
          <Background /><Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <small className="muted">גרירה לחיבור · דאבל־קליק לשינוי שם · Delete למחיקה</small>
      {/* Notes live in a ref; re-setting the nodes re-runs the effect above so the change is reported. */}
      <textarea className="notes" rows={5} defaultValue={value.notes} placeholder="הנחות, הערכות קיבולת, trade-offs, התמודדות עם כשלים"
        onChange={(event) => { notes.current = event.target.value; setNodes((current) => [...current]); }} />
    </div>
  );
}
