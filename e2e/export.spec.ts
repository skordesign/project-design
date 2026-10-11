import { expect, test, type Page } from "@playwright/test";

import { teamTasksDesign } from "@/lib/design/examples/team-tasks";
import { createProject } from "@/server/services/projects";
import { ownerId, resetDatabase, withDb } from "./helpers";

let owner = "";
test.beforeAll(async () => {
  owner = await ownerId();
});

const SLUG = "export-me";

test.beforeEach(async () => {
  await resetDatabase();
  await withDb((db) =>
    createProject(db, { ownerId: owner, name: "Export Me", slug: SLUG, document: teamTasksDesign }),
  );
});
test.afterAll(resetDatabase);

async function openExportDialog(page: Page) {
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Export diagram" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("export dialog previews the live canvas and the MMD diagram-as-code", async ({ page }) => {
  await page.setViewportSize({ width: 1700, height: 1000 });
  await page.goto(`/projects/${SLUG}`);
  // Datastores start collapsed; expand to show every component.
  await page.getByRole("button", { name: "Datastores collapsed (clean view)" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(21);

  const dialog = await openExportDialog(page);

  // Image preview renders from the mounted canvas.
  await expect(dialog.getByAltText("Diagram preview")).toBeVisible({ timeout: 20_000 });

  // MMD tab shows deterministic diagram-as-code with the AI header.
  await dialog.getByRole("radio", { name: /MMD/ }).click();
  const code = dialog.locator("pre");
  await expect(code).toContainText("flowchart LR");
  await expect(code).toContainText("get_design_schema");
  await expect(code).toContainText("subgraph svc_api");

  // Direction toggle rewrites the code.
  await dialog.getByRole("button", { name: /Top.*down/ }).click();
  await expect(code).toContainText("flowchart TD");

  // Project data actions are one click away.
  await expect(dialog.getByRole("button", { name: "Design JSON" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Markdown brief" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Copy SQL DDL" })).toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
});

test("MMD export works from a non-canvas tab without a preview", async ({ page }) => {
  await page.goto(`/projects/${SLUG}/overview`);
  const dialog = await openExportDialog(page);
  await dialog.getByRole("radio", { name: /MMD/ }).click();
  await expect(dialog.locator("pre")).toContainText("flowchart LR");
});
