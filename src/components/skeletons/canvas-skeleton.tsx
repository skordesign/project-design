import { Skeleton } from "@/components/ui/skeleton";

export function CanvasSkeleton() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-background">
      {/* Header Skeleton */}
      <header className="shrink-0 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex h-13 items-center justify-between gap-3 px-3 sm:px-4">
          {/* Left: Project identity */}
          <div className="flex min-w-0 items-center gap-2.5">
            <Skeleton className="size-8 rounded-lg" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-32 sm:w-48 rounded" />
              <Skeleton className="size-2 rounded-full" />
            </div>
          </div>

          {/* Center: Tabs Skeleton */}
          <div className="hidden lg:flex items-center gap-1 rounded-lg border bg-muted/40 p-1">
            {["w-16", "w-18", "w-14", "w-22", "w-18", "w-12", "w-16"].map((w, i) => (
              <Skeleton key={i} className={`h-6 ${w} rounded-md`} />
            ))}
          </div>

          {/* Right: Actions Skeleton */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border p-1">
              <Skeleton className="h-7 w-16 sm:w-20 rounded" />
              <Skeleton className="h-7 w-14 sm:w-16 rounded" />
              <Skeleton className="h-7 w-16 sm:w-24 rounded" />
            </div>
            <Skeleton className="h-8 w-20 rounded-md" />
            <Skeleton className="h-8 w-20 rounded-md" />
          </div>
        </div>

        {/* Mobile Sub-Nav Row Skeleton */}
        <div className="flex h-9 items-center border-t px-3 lg:hidden">
          <div className="flex items-center gap-1">
            {["w-14", "w-16", "w-12", "w-20", "w-16", "w-12"].map((w, i) => (
              <Skeleton key={i} className={`h-5 ${w} rounded`} />
            ))}
          </div>
        </div>
      </header>

      {/* Main Canvas + Sidebars Skeleton */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Left Palette Sidebar Skeleton */}
        <aside className="hidden md:flex w-68 shrink-0 flex-col border-r bg-background/95 p-3">
          <div className="flex h-8 items-center justify-between border-b pb-2 mb-3">
            <div className="flex items-center gap-1">
              <Skeleton className="h-6 w-14 rounded-md" />
              <Skeleton className="h-6 w-18 rounded-md" />
            </div>
            <Skeleton className="size-6 rounded-md" />
          </div>
          <Skeleton className="h-8 w-full rounded-lg mb-3" />
          <div className="space-y-4">
            {[1, 2, 3].map((cat) => (
              <div key={cat} className="space-y-2">
                <Skeleton className="h-3 w-28 rounded" />
                <div className="grid grid-cols-2 gap-1.5">
                  <Skeleton className="h-9 rounded-lg" />
                  <Skeleton className="h-9 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        </aside>

        {/* Canvas Center Area Skeleton */}
        <div className="relative flex-1 bg-[radial-gradient(circle,color-mix(in_oklch,var(--foreground)_10%,transparent)_1px,transparent_1px)] [background-size:20px_20px] p-6">
          {/* Top-center: Breadcrumb / Filter pill Skeleton */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <Skeleton className="h-8 w-44 rounded-lg shadow-xs" />
            <Skeleton className="h-8 w-28 rounded-lg shadow-xs" />
          </div>

          {/* Simulated Floating Architecture Nodes on Canvas */}
          <div className="absolute top-28 left-20 sm:left-36 w-80 rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm backdrop-blur-xs">
            <div className="flex items-center gap-2 mb-3">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 w-36 rounded" />
              <Skeleton className="h-4 w-14 rounded-full ml-auto" />
            </div>
            <Skeleton className="h-3 w-48 rounded mb-3" />
            <div className="space-y-2 border-t pt-2">
              <Skeleton className="h-7 w-full rounded-lg" />
              <Skeleton className="h-7 w-full rounded-lg" />
            </div>
          </div>

          {/* Second Simulated Node on Right */}
          <div className="absolute top-44 right-16 sm:right-32 w-64 rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm backdrop-blur-xs">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <Skeleton className="h-3 w-36 rounded mb-2" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>

          {/* Bottom-center: Toolbar Dock Skeleton */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
            <div className="flex h-10 items-center gap-1 rounded-xl border border-border/80 bg-background/95 px-2 shadow-lg backdrop-blur-md">
              <Skeleton className="size-7 rounded-lg" />
              <div className="h-4 w-px bg-border/80 mx-1" />
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="size-7 rounded-lg" />
              <div className="h-4 w-px bg-border/80 mx-1" />
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="size-7 rounded-lg" />
              <div className="h-4 w-px bg-border/80 mx-1" />
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="size-7 rounded-lg" />
              <div className="h-4 w-px bg-border/80 mx-1" />
              <Skeleton className="size-7 rounded-lg" />
              <Skeleton className="size-7 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Right Inspector Sidebar Skeleton (Desktop only) */}
        <aside className="hidden xl:flex w-90 shrink-0 flex-col border-l bg-background p-4">
          <div className="flex items-center justify-between border-b pb-3 mb-4">
            <Skeleton className="h-5 w-24 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-xl border p-2">
                <Skeleton className="size-7 rounded-lg" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
                <Skeleton className="size-4 rounded" />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
