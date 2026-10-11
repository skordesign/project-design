"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export async function copyText(text: string, label = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(label);
  } catch {
    toast.error("Couldn't copy. Select the text and copy it manually.");
  }
}

function Snippet({ title, text }: { title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="grid gap-1.5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Copy ${title}`}
          onClick={async () => {
            await copyText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
        {text}
      </pre>
    </div>
  );
}

/** Prompt for an agent working in an existing repository: map the code into the design. */
export const DESCRIBE_PROJECT_PROMPT = `Describe this repository in the project-design MCP server.
1. Call get_design_schema, then list_projects to find the (empty) project to fill.
2. Explore the code. Add what really exists with add_component and connect_components: services and apps, the layers and modules inside them, datastores with their entities, APIs with their operations, queues and channels, third-party integrations and actors.
3. Fill in the overview with update_overview, and the tech stack (versions from the lockfiles), conventions and notable architecture decisions with upsert_section_items.
4. Only add what you can point to in the code. Mark each component that is already implemented as done with set_component_status.
5. Finish with validate_design and summarise what you mapped and what you were unsure about.`;

/** Instruction prompt to save in the target codebase so any coding agent adheres to the design. */
export const AGENT_RULES_PROMPT = `# Architecture & Design Guidelines

This repository is governed by a software architecture design via the Project Design MCP server.
Before inspecting, creating or modifying any code in this repository:
1. Always call \`get_project_brief\` or \`get_build_plan\` to inspect the system architecture, active conventions, and build order.
2. Whenever working on a specific file (e.g. creating, editing or refactoring), call \`resolve_file_to_component(filePath: "...")\` to resolve the file's architectural component, service, layer, allowed dependencies, technology stack, and conventions.
3. Strictly adhere to layer boundaries. Never violate allowed layer dependencies or introduce unauthorized cross-boundary imports.
4. Keep design status synchronized: once an architectural component is fully implemented, call \`set_component_status\` to update its state to "done".`;

/** How to point a coding agent at this server. `token` is the placeholder unless one was just created. */
export function ConnectSnippets({ appUrl, token }: { appUrl: string; token?: string }) {
  const url = `${appUrl.replace(/\/$/, "")}/api/mcp`;
  const bearer = token ?? "<token>";
  const json = (value: unknown) => JSON.stringify(value, null, 2);
  const exportToken = `export PROJECT_DESIGN_TOKEN=${bearer}`;
  const clients = [
    {
      id: "claude",
      label: "Claude Code",
      snippets: [
        {
          title: "Terminal",
          text: `claude mcp add --transport http project-design ${url} --header "Authorization: Bearer ${bearer}"`,
        },
        {
          title: ".mcp.json in the repository (token from PROJECT_DESIGN_TOKEN)",
          text: json({
            mcpServers: {
              "project-design": {
                type: "http",
                url,
                headers: { Authorization: "Bearer ${PROJECT_DESIGN_TOKEN}" },
              },
            },
          }),
        },
      ],
    },
    {
      id: "codex",
      label: "Codex",
      snippets: [
        {
          title: "Terminal",
          text: `${exportToken}\ncodex mcp add project-design --url ${url} --bearer-token-env-var PROJECT_DESIGN_TOKEN`,
        },
        {
          title: "~/.codex/config.toml (same thing, by hand)",
          text: `[mcp_servers.project-design]\nurl = "${url}"\nbearer_token_env_var = "PROJECT_DESIGN_TOKEN"`,
        },
      ],
    },
    {
      id: "cursor",
      label: "Cursor",
      snippets: [
        {
          title: ".cursor/mcp.json in the repository, or ~/.cursor/mcp.json",
          text: json({
            mcpServers: {
              "project-design": {
                url,
                headers: { Authorization: "Bearer ${env:PROJECT_DESIGN_TOKEN}" },
              },
            },
          }),
        },
      ],
    },
    {
      id: "windsurf",
      label: "Windsurf",
      snippets: [
        {
          title: "~/.codeium/windsurf/mcp_config.json",
          text: json({
            mcpServers: {
              "project-design": {
                serverUrl: url,
                headers: { Authorization: "Bearer ${env:PROJECT_DESIGN_TOKEN}" },
              },
            },
          }),
        },
      ],
    },
    {
      id: "vscode",
      label: "VS Code",
      snippets: [
        {
          title: ".vscode/mcp.json (asks for the token once)",
          text: json({
            servers: {
              "project-design": {
                type: "http",
                url,
                headers: { Authorization: "Bearer ${input:project-design-token}" },
              },
            },
            inputs: [
              {
                type: "promptString",
                id: "project-design-token",
                description: "Project Design MCP token",
                password: true,
              },
            ],
          }),
        },
      ],
    },
    {
      id: "other",
      label: "Other",
      snippets: [
        {
          title: "Clients that only run local (stdio) servers: bridge with mcp-remote",
          text: json({
            mcpServers: {
              "project-design": {
                command: "npx",
                args: ["-y", "mcp-remote", url, "--header", "Authorization:${AUTH_HEADER}"],
                env: { AUTH_HEADER: `Bearer ${bearer}` },
              },
            },
          }),
        },
      ],
    },
  ];
  return (
    <div className="grid gap-4">
      <Tabs defaultValue="claude">
        <TabsList className="w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto">
          {clients.map((client) => (
            <TabsTrigger key={client.id} value={client.id} className="flex-none">
              {client.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {clients.map((client) => (
          <TabsContent key={client.id} value={client.id} className="grid gap-4 pt-2">
            {client.snippets.map((snippet) => (
              <Snippet key={snippet.title} title={snippet.title} text={snippet.text} />
            ))}
          </TabsContent>
        ))}
      </Tabs>
      <p className="text-sm text-muted-foreground">
        Most config files read the token from the{" "}
        <code className="font-mono text-xs">PROJECT_DESIGN_TOKEN</code> environment variable (
        <code className="font-mono text-xs">{exportToken}</code>). Any other agent: add a Streamable
        HTTP MCP server at <code className="font-mono text-xs">{url}</code> with the header{" "}
        <code className="font-mono text-xs">Authorization: Bearer {bearer}</code>. Create a
        project-scoped token for each repository.
      </p>
      <Snippet
        title="Agent rules instruction (save as AGENTS.md or .cursorrules in your repository)"
        text={AGENT_RULES_PROMPT}
      />
      <Snippet
        title="Then ask the agent to describe an existing project"
        text={DESCRIBE_PROJECT_PROMPT}
      />
      <p className="text-sm text-muted-foreground">
        To build from a finished design instead, run the{" "}
        <code className="font-mono text-xs">implement_design</code> prompt.
      </p>
    </div>
  );
}
