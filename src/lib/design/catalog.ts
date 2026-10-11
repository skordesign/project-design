/**
 * Semantics of the design vocabulary. The canvas uses it for the palette,
 * containment and connection rules; integrity.ts enforces the same rules; the
 * MCP `get_design_schema` tool hands these descriptions to agents verbatim, so
 * write them for an agent that has never seen this app.
 */
import type { EdgeKind, FieldType, NodeKind } from "@/lib/design/schema";
import { ARCHITECTURE_STYLES } from "@/lib/design/schema";

export interface NodeKindMeta {
  label: string;
  /** lucide-react icon name (PascalCase) used on the canvas and palette. */
  icon: string;
  /** Resizable group node that can hold children. */
  container: boolean;
  /** Allowed parent kinds; null = may sit at the top level. */
  parents: (NodeKind | null)[];
  defaultSize: { width: number; height: number };
  description: string;
}

export const NODE_KIND_META: Record<NodeKind, NodeKindMeta> = {
  service: {
    label: "Service",
    icon: "Box",
    container: true,
    parents: [null],
    defaultSize: { width: 520, height: 360 },
    description:
      "A deployable or runnable unit: web app, API server, worker, CLI, library or mobile app. " +
      "Generate one top-level directory/package per service at data.path. Layers and modules " +
      "inside it are its internal structure.",
  },
  layer: {
    label: "Layer",
    icon: "Layers",
    container: true,
    parents: ["service"],
    defaultSize: { width: 440, height: 140 },
    description:
      "An architectural layer inside a service (e.g. presentation, application, domain, " +
      "infrastructure). Modules inside a layer may only depend on modules in the same layer or " +
      "in layers this layer has a depends_on edge to. data.rules are hard constraints.",
  },
  module: {
    label: "Module",
    icon: "Puzzle",
    container: false,
    parents: ["service", "layer"],
    defaultSize: { width: 208, height: 54 },
    description:
      "A cohesive unit of code (feature, component, package or class group) with the listed " +
      "responsibilities. data.exports is its public interface; other modules use only that.",
  },
  entity: {
    label: "Entity",
    icon: "Table2",
    container: false,
    parents: [null, "datastore", "layer", "service", "system"],
    defaultSize: { width: 208, height: 54 },
    description:
      "A data model with typed fields. Inside a datastore it is a persisted table/collection; " +
      "inside a layer or service it is a domain/model type. Relations between entities are " +
      "relation edges, not ref fields.",
  },
  datastore: {
    label: "Datastore",
    icon: "Database",
    container: true,
    parents: [null],
    defaultSize: { width: 480, height: 300 },
    description:
      "A database, cache, object store or search index. Entities inside it are its schema. " +
      "Services/modules reach it through accesses edges.",
  },
  api: {
    label: "API",
    icon: "Plug",
    container: false,
    parents: [null],
    defaultSize: { width: 208, height: 54 },
    description:
      "An interface contract (REST, GraphQL, gRPC, tRPC, WebSocket) with operations and typed " +
      "payloads. The service/module with an exposes edge implements it; nodes with calls edges " +
      "consume it.",
  },
  integration: {
    label: "Integration",
    icon: "Cable",
    container: false,
    parents: [null],
    defaultSize: { width: 208, height: 54 },
    description:
      "A third-party system (payments, email, auth, AI, storage…). Wrap it behind an adapter in " +
      "each node that has a uses edge to it; data.env lists the credentials it needs.",
  },
  queue: {
    label: "Queue / Topic",
    icon: "Waypoints",
    container: false,
    parents: [null],
    defaultSize: { width: 208, height: 54 },
    description:
      "A message broker or event bus with named channels and typed payloads. Producers have " +
      "publishes edges, consumers have subscribes edges (edge.data.channelId picks the channel).",
  },
  actor: {
    label: "Actor",
    icon: "User",
    container: false,
    parents: [null],
    defaultSize: { width: 208, height: 54 },
    description:
      "A human role or external system that uses the project. Context only; nothing is generated.",
  },
  note: {
    label: "Note",
    icon: "StickyNote",
    container: false,
    parents: [null, "service", "layer", "datastore", "module", "system"],
    defaultSize: { width: 208, height: 112 },
    description: "A free-text annotation. Read it as guidance; it generates nothing by itself.",
  },
  loop: {
    label: "Gameplay loop",
    icon: "Repeat",
    container: false,
    parents: [null],
    defaultSize: { width: 208, height: 54 },
    description:
      "A gameplay loop the player repeats (e.g. combat 5–30 s, expedition 15–30 min, " +
      "progression over weeks): data.duration, data.motivation and data.steps in order. drives " +
      "edges point at the systems and mechanics the loop exercises, or at a nested inner loop. " +
      "Design context: nothing is generated from a loop itself.",
  },
  system: {
    label: "Game system",
    icon: "Cog",
    container: true,
    parents: [null],
    defaultSize: { width: 520, height: 320 },
    description:
      "A game system (combat, inventory, loot, progression, enemy AI, economy, multiplayer…). " +
      "Its mechanics, resources, content tables and data entities sit inside it. data.rules are " +
      "hard design rules, data.parameters are tuning values (starting points, not final " +
      "balance), data.formulas are the system's math, data.authority says who owns its state in " +
      "multiplayer, data.priority is mvp / launch / later. Implement it as one feature module " +
      "with its domain logic kept pure and testable; produces/consumes/triggers/modifies edges " +
      "say how it works with other systems, depends_on edges give the build order.",
  },
  mechanic: {
    label: "Mechanic",
    icon: "Zap",
    container: false,
    parents: ["system"],
    defaultSize: { width: 208, height: 54 },
    description:
      "One mechanic or feature of a system (dodge, damage calculation, personal loot, weapon " +
      "mastery…): data.trigger starts it, data.states are its states or phases in order, " +
      "data.rules, data.parameters and data.formulas define it exactly.",
  },
  resource: {
    label: "Resource",
    icon: "Gem",
    container: false,
    parents: [null, "system"],
    defaultSize: { width: 208, height: 54 },
    description:
      "A quantity the game tracks: a stat (health, stamina), attribute (strength), currency " +
      "(gold), material, item or experience. data.initial/min/max/regen are its values. Systems " +
      "and mechanics with produces edges are its sources, consumes edges are its sinks.",
  },
  content: {
    label: "Content table",
    icon: "TableProperties",
    container: false,
    parents: [null, "system"],
    defaultSize: { width: 208, height: 54 },
    description:
      "Authored content definitions as a table (enemy archetypes, rarity tiers, boss phases, " +
      "weapon families, difficulty scaling…): data.columns and data.rows. Generate these as " +
      "data assets (e.g. ScriptableObjects, JSON) with stable ids, not as hard-coded logic.",
  },
};

export const CONTAINER_KINDS = (Object.keys(NODE_KIND_META) as NodeKind[]).filter(
  (k) => NODE_KIND_META[k].container,
);

export interface EdgeKindMeta {
  label: string;
  from: NodeKind[];
  to: NodeKind[];
  description: string;
}

export const EDGE_KIND_META: Record<EdgeKind, EdgeKindMeta> = {
  depends_on: {
    label: "depends on",
    from: ["service", "layer", "module", "system", "mechanic"],
    to: ["service", "layer", "module", "system", "mechanic"],
    description:
      "Source code imports/uses the target; between game systems it means the target must be built first. Between layers it declares an allowed dependency " +
      "direction; never generate imports that go against it.",
  },
  calls: {
    label: "calls",
    from: ["service", "module"],
    to: ["api", "service"],
    description:
      "Runtime request from source to target over data.protocol. data.operations lists the " +
      "target API operation ids used (empty = unspecified).",
  },
  exposes: {
    label: "exposes",
    from: ["service", "module"],
    to: ["api"],
    description:
      "Source implements and serves the target API contract. data.operations lists the target " +
      "API operation ids this source implements, e.g. one controller's endpoints (empty = the " +
      "whole API).",
  },
  accesses: {
    label: "accesses",
    from: ["service", "layer", "module", "system", "mechanic"],
    to: ["datastore", "entity"],
    description: "Source reads and/or writes the target store or entity (data.mode).",
  },
  publishes: {
    label: "publishes",
    from: ["service", "module"],
    to: ["queue"],
    description: "Source produces messages to the queue (channel = data.channelId).",
  },
  subscribes: {
    label: "subscribes",
    from: ["service", "module"],
    to: ["queue"],
    description: "Source consumes messages from the queue (channel = data.channelId).",
  },
  uses: {
    label: "uses",
    from: ["service", "module", "system", "mechanic"],
    to: ["integration", "content"],
    description:
      "Source calls the third-party integration, or reads the content table (data.purpose says why).",
  },
  relation: {
    label: "relation",
    from: ["entity"],
    to: ["entity"],
    description:
      "Data relationship. one-to-many means one source row has many target rows; the foreign " +
      "key (data.foreignKey) lives on the target. many-to-many needs a join table.",
  },
  interacts: {
    label: "interacts",
    from: ["actor"],
    to: ["service", "api", "module", "loop", "system"],
    description: "An actor uses the target (data.via, e.g. 'browser', 'mobile app').",
  },
  drives: {
    label: "drives",
    from: ["loop"],
    to: ["loop", "system", "mechanic"],
    description:
      "The loop exercises the target system or mechanic; loop → loop means the target is an " +
      "inner loop repeated within the source.",
  },
  produces: {
    label: "produces",
    from: ["system", "mechanic", "content"],
    to: ["resource"],
    description: "Source is a source of the resource: grants, drops or regenerates it (data.rate).",
  },
  consumes: {
    label: "consumes",
    from: ["system", "mechanic"],
    to: ["resource"],
    description: "Source is a sink of the resource: spends or removes it (data.amount).",
  },
  triggers: {
    label: "triggers",
    from: ["system", "mechanic"],
    to: ["system", "mechanic"],
    description:
      "Gameplay event flow: when data.event happens in the source, the target reacts (e.g. " +
      "enemy defeated → loot roll). Implement as a typed event, not a direct call.",
  },
  modifies: {
    label: "modifies",
    from: ["system", "mechanic", "resource", "content"],
    to: ["system", "mechanic", "resource"],
    description:
      "Source changes the target's values or behaviour (data.effect), e.g. equipment modifies " +
      "stats, strength modifies damage.",
  },
};

/** Edge kinds allowed between two node kinds, most likely first (used to preselect on connect). */
export function allowedEdgeKinds(from: NodeKind, to: NodeKind): EdgeKind[] {
  const order: EdgeKind[] = [
    "drives",
    "produces",
    "consumes",
    "triggers",
    "modifies",
    "relation",
    "interacts",
    "exposes",
    "calls",
    "accesses",
    "publishes",
    "subscribes",
    "uses",
    "depends_on",
  ];
  return order.filter(
    (k) => EDGE_KIND_META[k].from.includes(from) && EDGE_KIND_META[k].to.includes(to),
  );
}

export function canContain(parent: NodeKind | null, child: NodeKind): boolean {
  return NODE_KIND_META[child].parents.includes(parent);
}

export const FIELD_TYPE_DESCRIPTIONS: Record<FieldType, string> = {
  string: "Short text (≤ 255 chars)",
  text: "Long text",
  int: "Integer",
  float: "Floating point number",
  decimal: "Exact decimal (money)",
  boolean: "true / false",
  date: "Calendar date (YYYY-MM-DD)",
  datetime: "Timestamp with time zone (ISO 8601)",
  uuid: "UUID",
  email: "Email address",
  url: "URL",
  json: "Arbitrary JSON",
  enum: "One of enumValues",
  ref: "Nested object of entity refEntityId (use list for arrays)",
};

export const ARCHITECTURE_STYLE_DESCRIPTIONS: Record<(typeof ARCHITECTURE_STYLES)[number], string> =
  {
    layered: "Horizontal layers; each layer only calls the layer(s) below it.",
    clean:
      "Clean Architecture: entities → use cases → interface adapters → frameworks; " +
      "dependencies point inward only.",
    hexagonal:
      "Ports and adapters: the domain core defines ports; adapters implement them at the edges.",
    "modular-monolith":
      "One deployable split into strongly bounded modules that talk through public interfaces.",
    microservices:
      "Independently deployable services that own their data and talk over APIs/events.",
    "event-driven": "Components communicate mainly by publishing and consuming events.",
    serverless: "Functions triggered by events/HTTP on managed infrastructure.",
    mvc: "Model-View-Controller.",
    other: "See overview.architectureNotes.",
  };

export interface PatternMeta {
  name: string;
  category: "creational" | "structural" | "behavioral" | "architectural" | "data" | "resilience";
  summary: string;
}

/** Suggestions for the patterns picker. Nodes may also name patterns not listed here. */
export const PATTERNS: PatternMeta[] = [
  { name: "Repository", category: "data", summary: "Collection-like interface over persistence." },
  { name: "Unit of Work", category: "data", summary: "Track changes and commit them atomically." },
  { name: "Data Mapper", category: "data", summary: "Map between domain objects and storage." },
  { name: "CQRS", category: "architectural", summary: "Separate read models from write models." },
  { name: "Event Sourcing", category: "data", summary: "Persist state as a sequence of events." },
  {
    name: "Transactional Outbox",
    category: "data",
    summary: "Write events in the same transaction as state, publish later.",
  },
  {
    name: "Service Layer",
    category: "architectural",
    summary: "Application operations as a thin orchestration layer.",
  },
  {
    name: "Dependency Injection",
    category: "structural",
    summary: "Pass collaborators in instead of constructing them.",
  },
  {
    name: "Ports and Adapters",
    category: "architectural",
    summary: "Core defines interfaces; edges implement them.",
  },
  {
    name: "API Gateway",
    category: "architectural",
    summary: "Single entry point that routes to services.",
  },
  {
    name: "Backend for Frontend",
    category: "architectural",
    summary: "An API shaped for one client.",
  },
  {
    name: "Saga",
    category: "resilience",
    summary: "Coordinate a multi-step transaction with compensations.",
  },
  {
    name: "Circuit Breaker",
    category: "resilience",
    summary: "Stop calling a failing dependency for a while.",
  },
  {
    name: "Retry with Backoff",
    category: "resilience",
    summary: "Retry transient failures with increasing delays.",
  },
  {
    name: "Idempotency Key",
    category: "resilience",
    summary: "Make retried requests safe to repeat.",
  },
  { name: "Factory", category: "creational", summary: "Encapsulate object creation." },
  { name: "Builder", category: "creational", summary: "Construct complex objects step by step." },
  { name: "Singleton", category: "creational", summary: "One shared instance (use sparingly)." },
  { name: "Adapter", category: "structural", summary: "Convert one interface into another." },
  { name: "Facade", category: "structural", summary: "Simple interface over a complex subsystem." },
  { name: "Decorator", category: "structural", summary: "Add behaviour by wrapping." },
  { name: "Proxy", category: "structural", summary: "Stand-in that controls access to an object." },
  {
    name: "Strategy",
    category: "behavioral",
    summary: "Interchangeable algorithms behind one interface.",
  },
  { name: "Observer", category: "behavioral", summary: "Notify subscribers of changes." },
  { name: "Command", category: "behavioral", summary: "Encapsulate a request as an object." },
  {
    name: "Mediator",
    category: "behavioral",
    summary: "Centralise communication between objects.",
  },
  {
    name: "Chain of Responsibility",
    category: "behavioral",
    summary: "Pass a request along handlers (middleware).",
  },
  { name: "State Machine", category: "behavioral", summary: "Explicit states and transitions." },
  {
    name: "Specification",
    category: "behavioral",
    summary: "Composable business rules/predicates.",
  },
  {
    name: "Pub/Sub",
    category: "architectural",
    summary: "Publishers and subscribers decoupled by topics.",
  },
];
