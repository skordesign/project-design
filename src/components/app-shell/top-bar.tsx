import { Network } from "lucide-react";
import Link from "next/link";

import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { UserMenu, type MenuUser } from "@/components/app-shell/user-menu";

const navLink = "rounded-md px-2.5 py-1 hover:bg-muted hover:text-foreground";

/** `account` is the session-dependent part (see src/app/account.tsx), streamed in by the layout. */
export function TopBar({ account }: { account: React.ReactNode }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur sm:gap-6 sm:px-4">
      <Link
        href="/"
        aria-label="Project Designer"
        className="group flex shrink-0 items-center gap-2 font-heading text-sm font-semibold"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground transition-transform duration-300 group-hover:rotate-12">
          <Network className="size-4" aria-hidden />
        </span>
        <span className="hidden sm:inline">Project Designer</span>
      </Link>
      {account}
      <ThemeToggle />
    </header>
  );
}

/** Main navigation and the account menu for a signed-in user; just a spacer otherwise. */
export function AccountNav({ user }: { user: MenuUser | null }) {
  if (!user) return <div className="ml-auto" />;
  return (
    <>
      <nav aria-label="Main" className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/projects" className={navLink}>
          Projects
        </Link>
        <Link href="/settings" className={navLink}>
          Settings
        </Link>
      </nav>
      <div className="ml-auto">
        <UserMenu user={user} />
      </div>
    </>
  );
}
