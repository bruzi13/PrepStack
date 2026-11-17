// A system design drawn on the architecture canvas, and its text form for the AI interviewer and grader.
import type { ArchitectureCanvas } from "./records";

export class ArchitectureDiagram {
  constructor(readonly canvas: ArchitectureCanvas) {}

  static empty(): ArchitectureCanvas {
    return { nodes: [], edges: [], notes: "" };
  }

  get componentCount(): number { return this.canvas.nodes.length; }

  private componentName(id: string): string {
    return this.canvas.nodes.find((node) => node.id === id)?.label ?? id;
  }

  /** Components, connections and notes as plain text. */
  toText(): string {
    const components = this.canvas.nodes.map((node) => `- ${node.label} [${node.kind}] (${node.id})`).join("\n") || "(none)";
    const connections = this.canvas.edges
      .map((edge) => `- ${this.componentName(edge.from)} -> ${this.componentName(edge.to)}${edge.label ? ` (${edge.label})` : ""}`)
      .join("\n") || "(none)";
    return `Components:\n${components}\nConnections:\n${connections}\nNotes:\n${this.canvas.notes || "(none)"}`;
  }
}
