"use client";

import {
  Bot,
  Bug,
  Database,
  FileJson,
  GitCompare,
  GitPullRequest,
  ListChecks,
  Network,
  PenTool,
  Plug,
  type LucideIcon,
} from "lucide-react";
import { MotionConfig, motion } from "motion/react";

import { GithubMark } from "@/components/landing/github-mark";
import { HeroDiagram } from "@/components/landing/hero-diagram";
import { Button } from "@/components/ui/button";

const REPO_URL = "https://github.com/skordesign/project-design";

const FEATURES: { icon: LucideIcon; title: string; body: string; color: string }[] = [
  {
    icon: PenTool,
    title: "Design on a canvas",
    body: "Services, layers, modules, data stores, APIs, queues and integrations, nested the way your system actually is.",
    color: "text-indigo-500 bg-indigo-500/10",
  },
  {
    icon: Plug,
    title: "Served over MCP",
    body: "Claude Code, Cursor and Codex read the design at /api/mcp and edit it with typed tools.",
    color: "text-sky-500 bg-sky-500/10",
  },
  {
    icon: FileJson,
    title: "Real contracts",
    body: "Typed API operations become OpenAPI 3.1. Entities and relations become a data model agents can migrate.",
    color: "text-amber-500 bg-amber-500/10",
  },
  {
    icon: ListChecks,
    title: "A build plan",
    body: "A dependency-ordered plan tells agents what to build first. Their progress shows up on your canvas.",
    color: "text-emerald-500 bg-emerald-500/10",
  },
  {
    icon: GitCompare,
    title: "Versions and diffs",
    body: "Publish snapshots, pin agents to a version and see exactly what changed since the last one.",
    color: "text-rose-500 bg-rose-500/10",
  },
  {
    icon: Database,
    title: "Yours, self-hosted",
    body: "One Docker Compose stack on Postgres. Use it locally with no login, or turn on GitHub sign-in and each account gets its own designs.",
    color: "text-violet-500 bg-violet-500/10",
  },
];

const STEPS = [
  {
    icon: Network,
    title: "Sketch the architecture",
    body: "Drop components on the canvas, connect them with typed edges and fill in the stack, conventions and decisions.",
  },
  {
    icon: Bot,
    title: "Connect your agent",
    body: "Create a token under Settings and paste one command. The agent gets the brief, contracts and build plan.",
  },
  {
    icon: ListChecks,
    title: "Watch it get built",
    body: "Agents report status per component as they work, so the design stays the source of truth.",
  },
];

const rise = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 120, damping: 20 } },
} as const;

const stagger = (delay = 0.08) =>
  ({ hidden: {}, show: { transition: { staggerChildren: delay } } }) as const;

/**
 * The public landing page. `cta` is the sign-in (or "open your projects") control, rendered on
 * the server because it depends on the session; `notice` is an optional sign-in error.
 */
export function Landing({ cta, notice }: { cta: React.ReactNode; notice?: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="relative isolate overflow-x-clip">
        <Backdrop />
        <Hero cta={cta} notice={notice} />
        <Features />
        <HowItWorks />
        <Contribute />
        <FinalCta cta={cta} />
        <footer className="border-t py-8 text-center text-xs text-muted-foreground">
          Project Designer · design once, let agents build it
        </footer>
      </div>
    </MotionConfig>
  );
}

/** Dot grid like the canvas, plus two slow-drifting colour washes. */
function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_70%)] bg-[radial-gradient(var(--canvas-dot)_1px,transparent_1px)] [background-size:22px_22px]" />
      <motion.div
        className="absolute -top-40 left-1/2 size-[42rem] -translate-x-[70%] rounded-full bg-indigo-500/15 blur-3xl"
        animate={{ x: [0, 60, 0], y: [0, 30, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute top-20 left-1/2 size-[34rem] -translate-x-[10%] rounded-full bg-sky-400/15 blur-3xl"
        animate={{ x: [0, -50, 0], y: [0, 40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function Hero({ cta, notice }: { cta: React.ReactNode; notice?: React.ReactNode }) {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 pt-16 pb-28 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-24">
      <motion.div variants={stagger(0.1)} initial="hidden" animate="show" className="grid gap-6">
        <motion.span
          variants={rise}
          className="inline-flex w-fit items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs text-muted-foreground backdrop-blur"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          Architecture your coding agents can read
        </motion.span>
        <motion.h1
          variants={rise}
          className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl"
        >
          Design the system.{" "}
          <span className="bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500 bg-clip-text text-transparent">
            Let your agents build it.
          </span>
        </motion.h1>
        <motion.p
          variants={rise}
          className="max-w-xl text-base text-pretty text-muted-foreground sm:text-lg"
        >
          Lay out services, data, APIs and integrations on a canvas. Project Designer turns it into
          briefs, contracts and a build plan that agents fetch over MCP, and shows their progress
          back on the canvas.
        </motion.p>
        <motion.div variants={rise} className="flex flex-wrap items-center gap-3">
          {cta}
          <a
            href="#how-it-works"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            How it works →
          </a>
        </motion.div>
        {notice && <motion.div variants={rise}>{notice}</motion.div>}
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="relative rounded-2xl border bg-canvas/70 p-4 shadow-2xl shadow-indigo-500/10 backdrop-blur sm:p-6"
      >
        <HeroDiagram />
      </motion.div>
    </section>
  );
}

function Features() {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
      <SectionHeading
        eyebrow="Everything an agent needs"
        title="One design, many outputs"
        body="The canvas is the contract. Every view an agent asks for comes from the same validated document."
      />
      <motion.ul
        variants={stagger()}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {FEATURES.map((f) => (
          <motion.li
            key={f.title}
            variants={rise}
            whileHover={{ y: -4 }}
            className="group rounded-2xl border bg-card/80 p-5 shadow-sm backdrop-blur transition-shadow hover:shadow-lg"
          >
            <span className={`mb-4 grid size-10 place-items-center rounded-xl ${f.color}`}>
              <f.icon
                className="size-5 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"
                aria-hidden
              />
            </span>
            <h3 className="font-heading font-medium">{f.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
          </motion.li>
        ))}
      </motion.ul>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
      <SectionHeading eyebrow="How it works" title="From sketch to shipped in three steps" />
      <div className="relative mt-14">
        <div className="absolute top-6 right-[16%] left-[16%] hidden h-px bg-border md:block">
          <motion.div
            className="h-full origin-left bg-gradient-to-r from-indigo-500 via-sky-500 to-emerald-500"
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-120px" }}
            transition={{ duration: 1.4, ease: "easeInOut", delay: 0.2 }}
          />
        </div>
        <motion.ol
          variants={stagger(0.15)}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          className="grid gap-10 md:grid-cols-3"
        >
          {STEPS.map((s, i) => (
            <motion.li key={s.title} variants={rise} className="relative text-center">
              <span className="relative mx-auto mb-4 grid size-12 place-items-center rounded-full border bg-background shadow-sm">
                <s.icon className="size-5" aria-hidden />
                <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                  {i + 1}
                </span>
              </span>
              <h3 className="font-heading font-medium">{s.title}</h3>
              <p className="mx-auto mt-1.5 max-w-xs text-sm text-muted-foreground">{s.body}</p>
            </motion.li>
          ))}
        </motion.ol>
      </div>
    </section>
  );
}

function Contribute() {
  return (
    <section id="contribute" className="mx-auto w-full max-w-6xl scroll-mt-16 px-4 py-20 sm:px-6">
      <SectionHeading
        eyebrow="Open source"
        title="Help build it"
        body="Project Designer is developed in the open. Bug fixes, new node kinds, MCP tools, docs: pull requests of any size are welcome, so feel free to open one."
      />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
        className="mt-8 flex flex-wrap justify-center gap-3"
      >
        <Button asChild size="lg" className="h-10 gap-2 px-4">
          <a href={`${REPO_URL}/pulls`} target="_blank" rel="noreferrer">
            <GitPullRequest className="size-4" aria-hidden />
            Open a pull request
          </a>
        </Button>
        <Button asChild size="lg" variant="outline" className="h-10 gap-2 px-4">
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            <GithubMark className="size-4" />
            View on GitHub
          </a>
        </Button>
        <Button asChild size="lg" variant="ghost" className="h-10 gap-2 px-4">
          <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
            <Bug className="size-4" aria-hidden />
            Report an issue
          </a>
        </Button>
      </motion.div>
    </section>
  );
}

function FinalCta({ cta }: { cta: React.ReactNode }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 pt-10 pb-24 sm:px-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-60px" }}
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className="relative overflow-hidden rounded-3xl border bg-card px-6 py-14 text-center shadow-sm"
      >
        <div
          aria-hidden
          className="absolute inset-0 -z-0 bg-[radial-gradient(ellipse_at_center,color-mix(in_oklch,var(--color-indigo-500)_12%,transparent),transparent_65%)]"
        />
        <div className="relative grid justify-items-center gap-4">
          <h2 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            Give your agents a blueprint
          </h2>
          <p className="max-w-md text-muted-foreground">
            Start from a blank canvas or the worked example.
          </p>
          {cta}
        </div>
      </motion.div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="mx-auto max-w-2xl text-center"
    >
      <p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight">{title}</h2>
      {body && <p className="mt-3 text-muted-foreground">{body}</p>}
    </motion.div>
  );
}
