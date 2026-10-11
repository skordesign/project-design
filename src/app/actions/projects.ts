"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ashenRealmsDesign } from "@/lib/design/examples/ashen-realms";
import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import type { DesignDocumentInput } from "@/lib/design/schema";
import { fail, type ActionResult } from "@/app/actions/types";
import { requirePrincipal } from "@/server/auth/current";
import { getDb } from "@/server/db/client";
import { AppError } from "@/server/errors";
import {
  createProject,
  deleteProject,
  duplicateProject,
  updateProjectMeta,
} from "@/server/services/projects";

const Name = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name is at most 120 characters");
const Description = z.string().trim().max(2000);

function invalid(error: z.ZodError): { ok: false; error: { code: string; message: string } } {
  return {
    ok: false,
    error: { code: "VALIDATION", message: error.issues[0]?.message ?? "Invalid input" },
  };
}

import { fullstackDesign, microservicesDesign } from "@/lib/design/examples/archetypes";

const CreateInput = z.object({
  name: Name,
  description: Description.default(""),
  template: z.enum(["blank", "example", "fullstack", "microservices", "game", "game-example"]).default("blank"),
});

const BLANK_GAME_DESIGN: DesignDocumentInput = { schemaVersion: 1, overview: { mode: "game" } };

function templateDocument(template: z.infer<typeof CreateInput>["template"]) {
  switch (template) {
    case "example":
      return teamTasksDesign;
    case "fullstack":
      return fullstackDesign;
    case "microservices":
      return microservicesDesign;
    case "game":
      return BLANK_GAME_DESIGN;
    case "game-example":
      return ashenRealmsDesign;
    default:
      return undefined;
  }
}

/** Creates a project and navigates to it. Only returns when something went wrong. */
export async function createProjectAction(input: unknown): Promise<ActionResult> {
  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  let slug: string;
  try {
    const { userId } = await requirePrincipal();
    const project = await createProject(getDb(), {
      ownerId: userId,
      name: parsed.data.name,
      description: parsed.data.description,
      document: templateDocument(parsed.data.template),
    });
    slug = project.slug;
  } catch (error) {
    return fail(error);
  }
  redirect(`/projects/${slug}`);
}

export async function renameProjectAction(slug: string, input: unknown): Promise<ActionResult> {
  const parsed = z.object({ name: Name }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    await updateProjectMeta(getDb(), slug, { name: parsed.data.name }, await requirePrincipal());
  } catch (error) {
    return fail(error);
  }
  refresh();
  return { ok: true };
}

export async function duplicateProjectAction(
  slug: string,
  input: unknown,
): Promise<ActionResult<{ slug: string }>> {
  const parsed = z.object({ name: Name }).safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  try {
    const copy = await duplicateProject(
      getDb(),
      slug,
      { name: parsed.data.name },
      await requirePrincipal(),
    );
    refresh();
    return { ok: true, slug: copy.slug };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteProjectAction(slug: string): Promise<ActionResult> {
  try {
    await deleteProject(getDb(), slug, await requirePrincipal());
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") {
      refresh();
      return { ok: true };
    }
    return fail(error);
  }
  refresh();
  return { ok: true };
}
