/**
 * Generates an ordered sequence of architectural steps for a walkthrough tour.
 * Orders nodes and transitions along directed edges (topological progression).
 * Pure and isomorphic.
 */
import { EDGE_KIND_META, NODE_KIND_META } from "@/lib/design/catalog";
import type { DesignDocument, DesignNode, NodeKind } from "@/lib/design/schema";

export interface WalkthroughStep {
  index: number;
  nodeId: string;
  nodeName: string;
  nodeKind: NodeKind;
  role: string;
  description: string;
  techSpecs?: string;
  tags: string[];
  responsibilities: string[];
  incomingTransitions: string[];
  outgoingTransitions: string[];
  edgeId?: string;
  edgeLabel?: string;
  nextTargetName?: string;
}

export function computeFlowWalkthrough(
  doc: DesignDocument,
  tag?: string | null,
): WalkthroughStep[] {
  // Filter nodes: if tag is provided, take nodes with that tag.
  // If no tag is provided, tour top-level architectural blocks (parentId === null) for high-level Big Picture.
  const relevantNodes = tag
    ? doc.nodes.filter((n) => n.tags.includes(tag))
    : doc.nodes.filter((n) => n.kind !== "note" && n.parentId === null);

  if (relevantNodes.length === 0) return [];

  const relevantNodeIds = new Set(relevantNodes.map((n) => n.id));
  const relevantEdges = doc.edges.filter(
    (e) => relevantNodeIds.has(e.source) && relevantNodeIds.has(e.target),
  );

  // Compute in-degrees within the subgraph to find starting nodes
  const inDegree = new Map<string, number>();
  for (const n of relevantNodes) inDegree.set(n.id, 0);
  for (const e of relevantEdges) {
    inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  }

  // Priority order for start: actors -> services -> others, sorted by in-degree ascending
  const startNodes = [...relevantNodes].sort((a, b) => {
    const degDiff = (inDegree.get(a.id) ?? 0) - (inDegree.get(b.id) ?? 0);
    if (degDiff !== 0) return degDiff;
    if (a.kind === "actor" && b.kind !== "actor") return -1;
    if (b.kind === "actor" && a.kind !== "actor") return 1;
    return a.position.x - b.position.x;
  });

  // Breadth-first topological-like traversal
  const visited = new Set<string>();
  const orderedNodes: DesignNode[] = [];
  const queue: string[] = [];

  for (const start of startNodes) {
    if (!visited.has(start.id)) {
      queue.push(start.id);
      visited.add(start.id);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        const currNode = relevantNodes.find((n) => n.id === currId);
        if (currNode) {
          orderedNodes.push(currNode);
        }

        // Outgoing edges
        const outgoing = relevantEdges.filter((e) => e.source === currId);
        for (const edge of outgoing) {
          if (!visited.has(edge.target)) {
            visited.add(edge.target);
            queue.push(edge.target);
          }
        }
      }
    }
  }

  // Any remaining nodes not reached
  for (const n of relevantNodes) {
    if (!visited.has(n.id)) {
      orderedNodes.push(n);
      visited.add(n.id);
    }
  }

  // Build steps with edge transition context and rich explanations
  const steps: WalkthroughStep[] = orderedNodes.map((node, i) => {
    // Find next edge from this node to the next or any downstream node
    const nextNode = orderedNodes[i + 1];
    const connectingEdge = nextNode
      ? relevantEdges.find((e) => e.source === node.id && e.target === nextNode.id)
      : relevantEdges.find((e) => e.source === node.id);

    const targetNode = connectingEdge
      ? doc.nodes.find((n) => n.id === connectingEdge.target)
      : undefined;

    let edgeLabel: string | undefined;
    if (connectingEdge) {
      const base = connectingEdge.label || EDGE_KIND_META[connectingEdge.kind].label;
      if (connectingEdge.kind === "calls" && connectingEdge.data.protocol) {
        edgeLabel = `${base} (${connectingEdge.data.protocol.toUpperCase()})`;
      } else if (connectingEdge.kind === "accesses" && connectingEdge.data.mode) {
        edgeLabel = `${base} (${connectingEdge.data.mode})`;
      } else {
        edgeLabel = base;
      }
    }

    const responsibilities =
      "responsibilities" in node.data && Array.isArray(node.data.responsibilities)
        ? (node.data.responsibilities as string[])
        : [];

    let role = NODE_KIND_META[node.kind].label;
    let techSpecs: string | undefined;
    let fallbackDesc = "";

    if (node.kind === "datastore" && "engine" in node.data) {
      const ver = node.data.version ? ` v${node.data.version}` : "";
      role = `${node.data.engine}${ver} database`;
      techSpecs = `${node.data.engine}${ver}`;
      fallbackDesc = node.data.purpose || `Persistent ${node.data.engine} storage for domain data.`;
    } else if (node.kind === "queue" && "technology" in node.data) {
      role = `${node.data.technology} message queue`;
      techSpecs = node.data.technology;
      fallbackDesc = "Asynchronous messaging backbone for decoupled system events.";
    } else if (node.kind === "service" && "framework" in node.data) {
      const parts = [
        node.data.framework,
        node.data.language,
        node.data.port ? `:${node.data.port}` : "",
      ].filter(Boolean);
      role = `${node.data.framework || "backend"} service`;
      techSpecs = parts.join(" · ");
      fallbackDesc = node.data.path
        ? `Application service residing at ${node.data.path}.`
        : "Core service handling business workflows.";
    } else if (node.kind === "api" && "style" in node.data) {
      const opCount = Array.isArray(node.data.operations) ? node.data.operations.length : 0;
      const auth = node.data.auth && node.data.auth !== "none" ? `Auth: ${node.data.auth}` : "";
      role = `${node.data.style.toUpperCase()} API`;
      techSpecs = [node.data.style.toUpperCase(), `${opCount} ops`, auth, node.data.basePath]
        .filter(Boolean)
        .join(" · ");
      fallbackDesc = `${node.data.style.toUpperCase()} contract interface exposing ${opCount} endpoints.`;
    } else if (node.kind === "integration" && "provider" in node.data) {
      role = `${node.data.provider} integration`;
      techSpecs = [node.data.category, node.data.sdk].filter(Boolean).join(" · ");
      fallbackDesc = node.data.purpose || `Third-party integration with ${node.data.provider}.`;
    } else if (node.kind === "actor") {
      role = "User / External Actor";
      fallbackDesc = "External actor initiating requests and driving system use cases.";
    }

    const description =
      node.description && node.description.trim().length > 0
        ? node.description.trim()
        : fallbackDesc || role;

    // Incoming transitions to this node
    const incomingEdges = doc.edges.filter((e) => e.target === node.id);
    const incomingTransitions = incomingEdges.map((e) => {
      const src = doc.nodes.find((n) => n.id === e.source);
      const proto =
        e.kind === "calls" && e.data.protocol ? ` (${e.data.protocol.toUpperCase()})` : "";
      return src ? `${src.name}${proto}` : e.label || e.kind;
    });

    // Outgoing transitions from this node
    const outgoingEdges = doc.edges.filter((e) => e.source === node.id);
    const outgoingTransitions = outgoingEdges.map((e) => {
      const tgt = doc.nodes.find((n) => n.id === e.target);
      const proto =
        e.kind === "calls" && e.data.protocol ? ` (${e.data.protocol.toUpperCase()})` : "";
      return tgt ? `${tgt.name}${proto}` : e.label || e.kind;
    });

    return {
      index: i + 1,
      nodeId: node.id,
      nodeName: node.name,
      nodeKind: node.kind,
      role,
      description,
      techSpecs,
      tags: node.tags || [],
      responsibilities,
      incomingTransitions,
      outgoingTransitions,
      edgeId: connectingEdge?.id,
      edgeLabel,
      nextTargetName: targetNode?.name,
    };
  });

  return steps;
}
