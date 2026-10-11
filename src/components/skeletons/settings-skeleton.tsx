import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function SettingsTokensSkeleton() {
  return (
    <>
      <section className="grid gap-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
        <div className="rounded-xl border bg-card p-1 shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Token</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-4 w-28 rounded" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24 rounded font-mono" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20 rounded" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-20 rounded" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-4 w-16 rounded" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-7 w-16 rounded" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-3">
        <Skeleton className="h-6 w-36 rounded" />
        <div className="grid gap-3">
          <div className="flex gap-2">
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center justify-between pb-3">
              <Skeleton className="h-4 w-32 rounded" />
              <Skeleton className="h-6 w-16 rounded" />
            </div>
            <Skeleton className="h-28 w-full rounded font-mono" />
          </div>
        </div>
      </section>
    </>
  );
}

export function SettingsSkeleton() {
  return (
    <main className="mx-auto grid w-full max-w-4xl gap-8 p-6">
      <Skeleton className="h-7 w-28 rounded" />
      <SettingsTokensSkeleton />
    </main>
  );
}
