import { connection } from "next/server";

import { toMermaidArchitecture, toMermaidSequence } from "@/lib/design/mermaid";
import { requirePrincipal } from "@/server/auth/current";
import { getDb } from "@/server/db/client";
import { errorResponse, parseVersionRef } from "@/server/http";
import { resolveDocument } from "@/server/services/versions";

export async function GET(request: Request, ctx: RouteContext<"/api/projects/[slug]/mermaid">) {
  await connection();
  try {
    const { slug } = await ctx.params;
    const url = new URL(request.url);
    const ref = parseVersionRef(url.searchParams.get("version"));
    const rawDirection = url.searchParams.get("direction");
    const direction = rawDirection === "TD" ? "TD" : "LR";
    const type = url.searchParams.get("type");
    const tag = url.searchParams.get("tag");
    const db = getDb();
    const resolved = await resolveDocument(db, slug, ref, await requirePrincipal());
    const isSequence = type === "sequence";
    const mmd = isSequence
      ? toMermaidSequence(resolved.document, tag)
      : toMermaidArchitecture(resolved.document, { direction });
    const suffix = isSequence ? "sequence" : "architecture";
    return new Response(mmd, {
      headers: {
        "Content-Type": "text/vnd.mermaid; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-${ref}.${suffix}.mmd"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
