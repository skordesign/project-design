/**
 * Formats DesignDocument metadata into Feishu / Lark interactive message card payloads.
 * Pure and isomorphic.
 */
import type { DesignDocument } from "@/lib/design/schema";

export interface FeishuCardPayload {
  msg_type: "interactive";
  card: {
    header: {
      title: {
        tag: "plain_text";
        content: string;
      };
      template: string;
    };
    elements: Array<Record<string, unknown>>;
  };
}

export function toFeishuCard(
  doc: DesignDocument,
  options?: { projectUrl?: string; releaseTag?: string },
): FeishuCardPayload {
  const serviceCount = doc.nodes.filter((n) => n.kind === "service").length;
  const apiCount = doc.nodes.filter((n) => n.kind === "api").length;
  const dbCount = doc.nodes.filter((n) => n.kind === "datastore").length;
  const edgeCount = doc.edges.length;

  const stackSummary =
    doc.stack.length > 0
      ? doc.stack.map((s) => `• **${s.category}**: ${s.name} ${s.version || ""}`).join("\n")
      : "No stack items defined";

  const overviewText = doc.overview.summary.trim() || "No overview provided";

  const elements: Array<Record<string, unknown>> = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**Architecture Overview**\n${overviewText}`,
      },
    },
    {
      tag: "hr",
    },
    {
      tag: "div",
      fields: [
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content: `**Services:** ${serviceCount}\n**APIs:** ${apiCount}`,
          },
        },
        {
          is_short: true,
          text: {
            tag: "lark_md",
            content: `**Datastores:** ${dbCount}\n**Connections:** ${edgeCount}`,
          },
        },
      ],
    },
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: `**Core Technology Stack**\n${stackSummary}`,
      },
    },
  ];

  if (options?.projectUrl) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: {
            tag: "plain_text",
            content: "Open in Canvas",
          },
          type: "primary",
          url: options.projectUrl,
        },
      ],
    });
  }

  const titlePrefix = options?.releaseTag ? `[${options.releaseTag}] ` : "";

  return {
    msg_type: "interactive",
    card: {
      header: {
        title: {
          tag: "plain_text",
          content: `${titlePrefix}Architecture Blueprint`,
        },
        template: "blue",
      },
      elements,
    },
  };
}
