import { Suspense } from "react";

import { ConnectSnippets } from "@/components/settings/connect-snippets";
import { CreateTokenDialog } from "@/components/settings/create-token-dialog";
import { TokensTable } from "@/components/settings/tokens-table";
import { requirePagePrincipal } from "@/server/auth/current";
import { getDb } from "@/server/db/client";
import { env } from "@/server/env";
import { listProjects } from "@/server/services/projects";
import { listTokens } from "@/server/services/tokens";

async function Tokens() {
  const principal = await requirePagePrincipal();
  const db = getDb();
  const [tokens, projects] = await Promise.all([
    listTokens(db, principal.userId),
    listProjects(db, principal),
  ]);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const { APP_URL } = env();
  return (
    <>
      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-lg font-medium">MCP tokens</h2>
          <CreateTokenDialog
            appUrl={APP_URL}
            projects={projects.map((p) => ({ slug: p.slug, name: p.name }))}
          />
        </div>
        <TokensTable
          tokens={tokens.map((t) => ({
            id: t.id,
            name: t.name,
            tokenPrefix: t.tokenPrefix,
            scope: t.projectId ? (names.get(t.projectId) ?? "Deleted project") : null,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            revokedAt: t.revokedAt?.toISOString() ?? null,
          }))}
        />
      </section>
      <section className="grid grid-cols-[minmax(0,1fr)] gap-3">
        <h2 className="font-heading text-lg font-medium">Connect an agent</h2>
        <ConnectSnippets appUrl={APP_URL} />
      </section>
    </>
  );
}

export default function SettingsPage() {
  return (
    <main className="mx-auto grid w-full max-w-4xl grid-cols-[minmax(0,1fr)] gap-8 p-4 sm:p-6">
      <h1 className="font-heading text-xl font-semibold">Settings</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <Tokens />
      </Suspense>
    </main>
  );
}
