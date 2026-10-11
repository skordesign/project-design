import { connection } from "next/server";

import { generateProjectScaffold, toScaffoldTreeAscii } from "@/lib/design/scaffold";
import { requirePrincipal } from "@/server/auth/current";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import { errorResponse, parseVersionRef } from "@/server/http";
import { resolveDocument } from "@/server/services/versions";

export async function GET(request: Request, ctx: RouteContext<"/api/projects/[slug]/scaffold">) {
  await connection();
  try {
    const { slug } = await ctx.params;
    const url = new URL(request.url);
    const ref = parseVersionRef(url.searchParams.get("version"));
    const format = url.searchParams.get("format") || "json"; // "json" | "tree"
    if (format !== "json" && format !== "tree") {
      throw new AppError("VALIDATION", `Invalid format "${format}". Use json or tree.`);
    }
    const serviceRef = url.searchParams.get("service") || undefined;

    const db = getDb();
    const resolved = await resolveDocument(db, slug, ref, await requirePrincipal());
    // Like the MCP tool: match a service by id or exact (case-insensitive) name.
    const services = resolved.document.nodes.filter((n) => n.kind === "service");
    const matches = serviceRef
      ? services.filter(
          (s) => s.id === serviceRef || s.name.toLowerCase() === serviceRef.toLowerCase(),
        )
      : [];
    if (serviceRef && matches.length === 0) {
      throw new AppError(
        "NOT_FOUND",
        `No service with id or name "${serviceRef}" in project "${slug}"`,
      );
    }
    if (matches.length > 1) {
      throw new AppError(
        "VALIDATION",
        `"${serviceRef}" matches several services; pass an id: ` +
          matches.map((s) => `${s.name} [${s.id}]`).join(", "),
      );
    }
    const scaffold = generateProjectScaffold(
      resolved.document,
      {
        name: resolved.project.name,
        slug: resolved.project.slug,
        appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      },
      { serviceId: matches[0]?.id },
    );

    if (format === "tree") {
      const treeText = toScaffoldTreeAscii(scaffold);
      return new Response(treeText, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${slug}-scaffold.txt"`,
        },
      });
    }

    return new Response(JSON.stringify(scaffold, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-scaffold.json"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
