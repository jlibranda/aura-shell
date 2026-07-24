"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound, LifeBuoy } from "lucide-react";
import { DropdownMenu, MenuItem, Avatar } from "@/components/ui/overlay";
import { Separator } from "@/components/ui/primitives";
import { useAuthStore } from "@/stores/auth-store";
import { CURRENT_USER } from "@/lib/mock-data";
import { logoutAction } from "@/app/(auth)/logout/actions";

export function UserMenu() {
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);
  const user = useAuthStore((s) => s.user) ?? CURRENT_USER;

  return (
    <DropdownMenu
      width="w-64"
      trigger={({ open, toggle }) => (
        <button
          onClick={toggle}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Open account menu"
          className="flex items-center rounded-full focus-visible:outline-none"
        >
          <Avatar name={user.name} />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar name={user.name} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {user.name}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {user.role}
              </div>
            </div>
          </div>
          <Separator className="my-1" />
          <MenuItem icon={UserRound} onClick={close}>
            My profile
          </MenuItem>
          <MenuItem
            icon={Settings}
            onClick={() => {
              close();
              router.push("/settings");
            }}
          >
            Settings
          </MenuItem>
          <MenuItem icon={LifeBuoy} onClick={close}>
            Help &amp; support
          </MenuItem>
          <Separator className="my-1" />
          <MenuItem
            icon={LogOut}
            tone="danger"
            onClick={async () => {
              close();
              signOut();
              // logoutAction() always redirects to /login itself (a no-op
              // session termination in development, a real one in production).
              await logoutAction();
            }}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </DropdownMenu>
  );
}
