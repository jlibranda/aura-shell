"use client";

import { Contact, Phone, Mail, MapPin, Star, UserRound } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { WorkspaceEmpty } from "@/components/people/profile/workspace-empty";
import { WorkspaceSummaryCard } from "@/components/people/profile/workspace-summary-card";
import { Card, Badge } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlay";
import type { EmergencyContact, Employee } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

function ContactRow({
  icon: Icon,
  value,
  href,
}: {
  icon: typeof Phone;
  value?: string;
  href?: string;
}) {
  const empty = !value;
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {empty ? (
        <span className="italic text-muted-foreground/60">Not provided</span>
      ) : href ? (
        <a href={href} className="truncate text-foreground hover:underline">
          {value}
        </a>
      ) : (
        <span className="truncate text-foreground">{value}</span>
      )}
    </div>
  );
}

function EmergencyContactCard({ contact }: { contact: EmergencyContact }) {
  return (
    <Card className={cn("p-4", contact.isPrimary && "ring-1 ring-inset ring-primary/25")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={contact.name} size="md" />
          <div className="min-w-0">
            <h4 className="truncate text-sm font-semibold text-foreground">{contact.name}</h4>
            <p className="text-xs text-muted-foreground">{contact.relationship}</p>
          </div>
        </div>
        {contact.isPrimary ? (
          <Badge tone="primary" className="gap-1">
            <Star className="h-3 w-3" />
            Primary
          </Badge>
        ) : null}
      </div>

      <div className="mt-3 space-y-2 border-t border-border pt-3">
        <ContactRow icon={Phone} value={contact.phone} href={contact.phone ? `tel:${contact.phone}` : undefined} />
        <ContactRow icon={Mail} value={contact.email} href={contact.email ? `mailto:${contact.email}` : undefined} />
        <ContactRow icon={MapPin} value={(contact as EmergencyContact & { address?: string }).address} />
      </div>
    </Card>
  );
}

export function EmergencyContactsTab({ employee }: { employee: Employee }) {
  const contacts = [...employee.emergencyContacts].sort(
    (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
  );

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ProfileSectionCard title="Emergency contacts" icon={Contact}>
          {contacts.length === 0 ? (
            <WorkspaceEmpty
              icon={UserRound}
              title="No emergency contacts"
              description="No emergency contacts have been recorded for this employee."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {contacts.map((contact) => (
                <EmergencyContactCard key={contact.id} contact={contact} />
              ))}
            </div>
          )}
        </ProfileSectionCard>
      </div>

      <WorkspaceSummaryCard employee={employee} />
    </div>
  );
}