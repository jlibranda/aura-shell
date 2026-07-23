import {
  User,
  Contact,
  Briefcase,
  IdCard,
  Phone,
  ClipboardCheck,
  type LucideIcon,
} from "lucide-react";
import type { HireStepKey } from "@/lib/people/hire-types";

export interface HireStepMeta {
  key: HireStepKey;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const HIRE_STEPS: HireStepMeta[] = [
  { key: "personal", label: "Personal", description: "Basic details", icon: User },
  { key: "contact", label: "Contact", description: "Email & phone", icon: Contact },
  { key: "employment", label: "Employment", description: "Role & team", icon: Briefcase },
  { key: "government", label: "Government IDs", description: "Statutory IDs", icon: IdCard },
  { key: "emergency", label: "Emergency", description: "Contact person", icon: Phone },
  { key: "review", label: "Review", description: "Confirm & submit", icon: ClipboardCheck },
];