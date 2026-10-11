import { SectionPage } from "@/components/sections/section-page";
import { Skeleton } from "@/components/ui/skeleton";

export function BriefSkeleton() {
  return (
    <SectionPage
      wide
      title="Architecture Brief"
      description="The compiled design as markdown. Use this as context for a coding agent."
    >
      <div className="flex flex-col gap-4">
        {/* Actions bar skeleton */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-44 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
        </div>

        {/* Markdown content container skeleton */}
        <div className="rounded-xl border bg-card p-6 shadow-xs space-y-4">
          <Skeleton className="h-7 w-64 rounded-md" />
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-5/6 rounded" />
          <Skeleton className="h-4 w-4/6 rounded" />

          <div className="pt-4 space-y-3">
            <Skeleton className="h-6 w-48 rounded-md" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          </div>

          <div className="pt-4 space-y-3">
            <Skeleton className="h-6 w-40 rounded-md" />
            <Skeleton className="h-4 w-full rounded" />
            <Skeleton className="h-4 w-3/4 rounded" />
          </div>
        </div>
      </div>
    </SectionPage>
  );
}
