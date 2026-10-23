import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  ARCHITECTURE_STYLE_DESCRIPTIONS,
  DESIGN_KITS,
  EDGE_KIND_META,
  FIELD_TYPE_DESCRIPTIONS,
  NODE_KIND_META,
  PATTERNS,
} from "@/lib/design/catalog";
import { designJsonSchema } from "@/lib/design/schema";
import { jsonResult } from "@/server/mcp/context";

const GUIDE = `# How to read a design

- A design is a graph: **nodes** (components) and **edges** (typed connections), plus project-wide
  tech stack, conventions and architecture decisions.
- **Modes.** \`overview.mode\` is "software" (services, data, APIs, messaging) or "game" (gameplay
  loops, systems, mechanics, resources, content). \`modes\` lists the component kinds each mode
  offers; prefer those. Other kinds stay valid in either mode.
- **Containment.** A node's \`parentId\` says where it sits: layers and modules live inside a
  service, entities inside a datastore, and so on (see each node kind's allowed parents). The
  \`position\` is only canvas layout; ignore it.
- **Ids** are stable forever and are what you pass to tools. Names are for humans.
- **Scopes.** A stack item or convention with a \`scope\` applies to those nodes and their
  descendants; an empty scope means the whole project. A scoped stack item replaces project-wide
  items of the same category for the nodes it covers.
- **TypeShape** (API request/response, queue payload): either an entity (\`entityId\`, optionally
  a \`list\`) or inline \`fields\`.
- **Layers.** A \`depends_on\` edge between layers declares an allowed dependency direction. Do not
  generate imports that go against it.
- **Game designs** (\`overview.mode\` "game"). \`loop\`s drive \`system\`s; each system holds its
  \`mechanic\`s, \`resource\`s and \`content\` tables. produces/consumes edges are a resource's
  sources and sinks, triggers edges are gameplay events, modifies edges change values,
  depends_on edges give the build order. Parameters are tuning starting points; rules and
  formulas are exact. \`milestones\` is the roadmap; build in that order.
- **Versions.** The *draft* is the working copy; *published versions* are immutable snapshots. Pin
  a version number when you want a stable target.
- Report progress with set_component_status so the designer sees it on the canvas.
- **Editing.** The edit tools change the *draft* only (never a published version). Each call is
  checked against the same rules as the canvas and saved at once; an invalid change is rejected
  with the reasons. Prefer them to save_project_design, which replaces the whole document.`;

export function registerSchemaTools(server: McpServer) {
  server.registerTool(
    "get_design_schema",
    {
      title: "Explain the design format",
      description:
        "Explain the design format: the components each design mode (software, game) offers, what every node kind, edge kind and field type means, containment rules, and the JSON Schema of a design document. Read once before interpreting a design.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () =>
      jsonResult({
        guide: GUIDE,
        modes: DESIGN_KITS,
        nodeKinds: NODE_KIND_META,
        edgeKinds: EDGE_KIND_META,
        fieldTypes: FIELD_TYPE_DESCRIPTIONS,
        architectureStyles: ARCHITECTURE_STYLE_DESCRIPTIONS,
        patterns: PATTERNS,
        jsonSchema: designJsonSchema(),
      }),
  );
}
