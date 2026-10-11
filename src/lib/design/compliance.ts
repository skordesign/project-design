/**
 * Compliance: did the agent actually follow the design, and how far did it get?
 * Pure and isomorphic. The MCP `get_compliance_report` tool and the
 * `scripts/design-gate.mjs` CI gate both evaluate through here, so a gate
 * failure means exactly what the tool reports — no drift between them.
 */
import type { BuildStep } from "@/lib/design/build-plan";
import type { Issue } from "@/lib/design/integrity";
import type { ComponentStatus } from "@/lib/design/status";

export interface StatusDetail {
  status: ComponentStatus;
  note: string;
  updatedAt: Date;
}

export interface ComplianceThresholds {
  /** Gate fails below this percent of done steps (0–100). Default 0. */
  minDonePercent?: number;
  /** Gate fails when any step is blocked. Default false. */
  failOnBlocked?: boolean;
  /** Gate fails when any step is stale. Default false. */
  failOnStale?: boolean;
  /** An in_progress step untouched for this long counts as stale. Default 24. */
  staleHours?: number;
}

export interface ComplianceItem {
  id: string;
  title: string;
  path: string;
  status: ComponentStatus;
  note: string;
  updatedAt: string | null;
  stale: boolean;
}

export interface ComplianceGate {
  pass: boolean;
  reasons: string[];
}

export interface ComplianceReport {
  /** Steps counted (the synthetic "setup" step is excluded). */
  totalSteps: number;
  totals: Record<ComponentStatus | "unreported", number>;
  /** 0–100, done / totalSteps. 100 when there is nothing to build. */
  percentDone: number;
  blocked: ComplianceItem[];
  stale: ComplianceItem[];
  validation: { errors: number; warnings: number };
  gate: ComplianceGate;
}

const EMPTY_TOTALS = (): Record<ComponentStatus | "unreported", number> => ({
  todo: 0,
  in_progress: 0,
  done: 0,
  blocked: 0,
  unreported: 0,
});

export function evaluateCompliance(
  input: {
    steps: BuildStep[];
    details?: Map<string, StatusDetail>;
    issues?: Issue[];
    now?: Date;
  },
  thresholds: ComplianceThresholds = {},
): ComplianceReport {
  const { steps, details = new Map(), issues = [], now = new Date() } = input;
  const {
    minDonePercent = 0,
    failOnBlocked = false,
    failOnStale = false,
    staleHours = 24,
  } = thresholds;
  const staleAfterMs = Math.max(0, staleHours) * 3_600_000;

  const totals = EMPTY_TOTALS();
  const blocked: ComplianceItem[] = [];
  const stale: ComplianceItem[] = [];
  const buildSteps = steps.filter((s) => s.id !== "setup");

  for (const step of buildSteps) {
    const detail = details.get(step.id);
    const status = step.status;
    if (!status) {
      totals.unreported += 1;
      continue;
    }
    totals[status] += 1;
    const updatedAt = detail ? detail.updatedAt : null;
    const isStale =
      status === "in_progress" &&
      updatedAt !== null &&
      now.getTime() - updatedAt.getTime() > staleAfterMs;
    if (status === "blocked" || isStale) {
      const item: ComplianceItem = {
        id: step.id,
        title: step.title,
        path: step.path,
        status,
        note: detail?.note ?? "",
        updatedAt: updatedAt ? updatedAt.toISOString() : null,
        stale: isStale,
      };
      if (status === "blocked") blocked.push(item);
      if (isStale) stale.push(item);
    }
  }

  const totalSteps = buildSteps.length;
  const percentDone = totalSteps === 0 ? 100 : Math.round((totals.done / totalSteps) * 100);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;

  const reasons: string[] = [];
  if (percentDone < minDonePercent) {
    reasons.push(`${percentDone}% done is below the required ${minDonePercent}%`);
  }
  if (failOnBlocked && blocked.length > 0) {
    reasons.push(
      `${blocked.length} blocked step(s): ${blocked
        .map((b) => `"${b.title}" [${b.id}]`)
        .join(", ")}`,
    );
  }
  if (failOnStale && stale.length > 0) {
    reasons.push(
      `${stale.length} stale in_progress step(s) untouched for over ${staleHours}h: ${stale
        .map((s) => `"${s.title}" [${s.id}]`)
        .join(", ")}`,
    );
  }
  // Integrity errors always fail the gate: the design itself cannot be trusted.
  if (errors > 0) {
    reasons.push(`${errors} design integrity error(s): fix the design before building`);
  }

  return {
    totalSteps,
    totals,
    percentDone,
    blocked,
    stale,
    validation: { errors, warnings },
    gate: { pass: reasons.length === 0, reasons },
  };
}

/** One-screen markdown summary of a report, for CI logs and chat. */
export function renderComplianceMarkdown(
  project: { name: string; slug: string },
  ref: string,
  report: ComplianceReport,
): string {
  const t = report.totals;
  const lines = [
    `# Compliance: ${project.name} (\`${project.slug}\`, ${ref})`,
    ``,
    `- Progress: **${report.percentDone}%** done (${t.done}/${report.totalSteps} steps; ` +
      `${t.in_progress} in progress, ${t.todo} todo, ${t.unreported} unreported, ${t.blocked} blocked)`,
    `- Validation: ${report.validation.errors} error(s), ${report.validation.warnings} warning(s)`,
    `- Gate: **${report.gate.pass ? "PASS" : "FAIL"}**` +
      (report.gate.reasons.length > 0 ? ` — ${report.gate.reasons.join("; ")}` : ""),
  ];
  for (const b of report.blocked) {
    lines.push(`- BLOCKED [${b.id}] ${b.title} (${b.path})${b.note ? ` — ${b.note}` : ""}`);
  }
  for (const s of report.stale) {
    lines.push(`- STALE [${s.id}] ${s.title} (${s.path}, untouched since ${s.updatedAt})`);
  }
  return lines.join("\n") + "\n";
}
