"use client";

import { Monitor, Moon, Sun, Check } from "lucide-react";
import { useTheme, type Theme } from "@/components/providers";
import { DropdownMenu, MenuItem, MenuLabel } from "@/components/ui/overlay";
import { IconButton } from "@/components/ui/button";
import { useMounted } from "@/lib/hooks";

const OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  // Before mount, render a stable neutral icon to avoid a hydration mismatch.
  const CurrentIcon = !mounted ? Sun : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu
      width="w-44"
      trigger={({ toggle }) => (
        <IconButton label="Change theme" onClick={toggle}>
          <CurrentIcon className="h-[18px] w-[18px]" />
        </IconButton>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Theme</MenuLabel>
          {OPTIONS.map((opt) => (
            <MenuItem
              key={opt.value}
              icon={opt.icon}
              onClick={() => {
                setTheme(opt.value);
                close();
              }}
              trailing={
                theme === opt.value ? (
                  <Check className="h-4 w-4 text-primary" />
                ) : null
              }
            >
              {opt.label}
            </MenuItem>
          ))}
        </>
      )}
    </DropdownMenu>
  );
}
