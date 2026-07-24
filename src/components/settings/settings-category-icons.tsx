import { Building2, ClipboardList, Landmark, Settings2, ShieldCheck, Sliders, Wallet, type LucideIcon } from "lucide-react";

/**
 * Presentation-only mapping from a category key to its icon. This holds NO
 * category identity, status, ordering, or copy — those live solely in the
 * registry manifest. It exists only because an icon is a visual choice, not
 * platform metadata. A key with no entry falls back to a neutral icon.
 */
const ICONS: Readonly<Record<string, LucideIcon>> = Object.freeze({
  general: Sliders,
  organization: Building2,
  access_control: ShieldCheck,
  timekeeping: ClipboardList,
  payroll: Wallet,
  audit: Landmark,
});

export function iconForCategory(key: string): LucideIcon {
  return ICONS[key] ?? Settings2;
}
