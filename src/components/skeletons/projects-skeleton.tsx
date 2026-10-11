import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ProjectsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <Card key={i} className="flex min-h-48 flex-col justify-between border bg-card p-5 shadow-xs">
          <CardContent className="flex flex-1 flex-col gap-3 p-0">
            {/* Header: Icon + Name + Menu */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Skeleton className="size-8 rounded-lg shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
              <Skeleton className="size-6 rounded shrink-0" />
            </div>

            {/* Description */}
            <div className="space-y-1.5 py-1">
              <Skeleton className="h-3.5 w-full rounded" />
              <Skeleton className="h-3.5 w-3/4 rounded" />
            </div>

            {/* Chips at bottom */}
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
              <Skeleton className="h-6 w-16 rounded-md" />
              <Skeleton className="h-6 w-24 rounded-md" />
              <Skeleton className="h-6 w-14 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
