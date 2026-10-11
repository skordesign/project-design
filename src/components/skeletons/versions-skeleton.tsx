import { SectionPage } from "@/components/sections/section-page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function VersionsSkeleton() {
  return (
    <SectionPage
      wide
      title="Versions"
      description="Immutable snapshots cut from the draft. An agent can target a specific version."
    >
      <div className="rounded-xl border bg-card p-1 shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Version</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-28">Components</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[1, 2, 3, 4].map((i) => (
              <TableRow key={i}>
                <TableCell>
                  <Skeleton className="h-5 w-10 rounded-md" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32 rounded" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24 rounded" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-12 rounded" />
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Skeleton className="h-6 w-28 rounded" />
                    <Skeleton className="h-6 w-20 rounded" />
                    <Skeleton className="h-6 w-16 rounded" />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionPage>
  );
}
