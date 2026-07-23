"use client";

import { useMemo, useState } from "react";
import { User, Contact, Phone } from "lucide-react";
import { Drawer, DrawerFooterActions } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { Combobox, Select, type ComboboxOption } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { toast } from "@/components/ui/toast";
import { ActionField, invalidRing } from "@/components/people/actions/action-field";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { CURRENT_USER } from "@/lib/mock-data";
import { fullName } from "@/lib/people/directory-query";
import type { Employee, FieldErrors, TimelineEvent } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

const GENDER_OPTIONS: ComboboxOption[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
  { value: "non_binary", label: "Non-binary" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const CIVIL_OPTIONS: ComboboxOption[] = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "widowed", label: "Widowed" },
  { value: "separated", label: "Separated" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d][\d\s()-]{6,}$/;

interface EditForm {
  firstName: string;
  middleName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: string | null;
  gender: string;
  maritalStatus: string;
  nationality: string;
  personalEmail: string;
  workEmail: string;
  phone: string;
  address: string;
  ecName: string;
  ecRelationship: string;
  ecPhone: string;
  ecEmail: string;
  ecAddress: string;
}

function SectionHeading({ icon: Icon, children }: { icon: typeof User; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 border-b border-border pb-2">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <h3 className="text-sm font-semibold text-foreground">{children}</h3>
    </div>
  );
}

export function EditProfileDrawer({
  employee,
  open,
  onClose,
}: {
  employee: Employee;
  open: boolean;
  onClose: () => void;
}) {
  const updateEmployee = usePeopleRepository((s) => s.updateEmployee);
  const addEmergencyContact = usePeopleRepository((s) => s.addEmergencyContact);
  const updateEmergencyContact = usePeopleRepository((s) => s.updateEmergencyContact);

  const primaryContact =
    employee.emergencyContacts.find((c) => c.isPrimary) ?? employee.emergencyContacts[0];

  const initial: EditForm = useMemo(
    () => ({
      firstName: employee.personal.firstName,
      middleName: employee.personal.middleName ?? "",
      lastName: employee.personal.lastName,
      preferredName: employee.personal.preferredName ?? "",
      dateOfBirth: employee.personal.dateOfBirth ?? null,
      gender: employee.personal.gender ?? "",
      maritalStatus: employee.personal.maritalStatus ?? "",
      nationality: "Filipino",
      personalEmail: "",
      workEmail: employee.personal.email,
      phone: employee.personal.phone ?? "",
      address: employee.personal.address ?? "",
      ecName: primaryContact?.name ?? "",
      ecRelationship: primaryContact?.relationship ?? "",
      ecPhone: primaryContact?.phone ?? "",
      ecEmail: primaryContact?.email ?? "",
      ecAddress: (primaryContact as { address?: string } | undefined)?.address ?? "",
    }),
    [employee, primaryContact],
  );

  const [form, setForm] = useState<EditForm>(initial);
  const [showErrors, setShowErrors] = useState(false);
  const patch = (p: Partial<EditForm>) => setForm((prev) => ({ ...prev, ...p }));

  const errors: FieldErrors = useMemo(() => {
    const e: FieldErrors = {};
    if (!form.firstName.trim()) e.firstName = "First name is required.";
    if (!form.lastName.trim()) e.lastName = "Last name is required.";
    if (!form.workEmail.trim()) e.workEmail = "Work email is required.";
    else if (!EMAIL_RE.test(form.workEmail)) e.workEmail = "Enter a valid email address.";
    if (form.personalEmail && !EMAIL_RE.test(form.personalEmail))
      e.personalEmail = "Enter a valid email address.";
    if (form.phone && !PHONE_RE.test(form.phone)) e.phone = "Enter a valid mobile number.";
    const ecStarted = Boolean(
      form.ecName || form.ecRelationship || form.ecPhone || form.ecEmail || form.ecAddress,
    );
    if (ecStarted) {
      if (!form.ecName.trim()) e.ecName = "Contact name is required.";
      if (!form.ecRelationship.trim()) e.ecRelationship = "Relationship is required.";
      if (!form.ecPhone.trim()) e.ecPhone = "Mobile number is required.";
      else if (!PHONE_RE.test(form.ecPhone)) e.ecPhone = "Enter a valid mobile number.";
      if (form.ecEmail && !EMAIL_RE.test(form.ecEmail)) e.ecEmail = "Enter a valid email address.";
    }
    return e;
  }, [form]);

  const displayErrors = showErrors ? errors : {};
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const submit = () => {
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      toast.error("Please fix the highlighted fields");
      return;
    }

    const event: TimelineEvent = {
      id: `tl-${employee.id}-edit-${Date.now().toString(36)}`,
      type: "note_added",
      title: "Profile updated",
      description: "Personal, contact, or emergency details were edited.",
      timestamp: new Date().toISOString(),
      actor: CURRENT_USER.name,
    };

    updateEmployee(employee.id, {
      personal: {
        ...employee.personal,
        firstName: form.firstName.trim(),
        middleName: form.middleName.trim() || undefined,
        lastName: form.lastName.trim(),
        preferredName: form.preferredName.trim() || undefined,
        dateOfBirth: form.dateOfBirth ?? undefined,
        gender: (form.gender || undefined) as Employee["personal"]["gender"],
        maritalStatus: (form.maritalStatus || undefined) as Employee["personal"]["maritalStatus"],
        email: form.workEmail.trim(),
        phone: form.phone.trim() || undefined,
        address: form.address.trim() || undefined,
      },
      timeline: [event, ...employee.timeline],
    });

    // Emergency contact: update the primary in place, or add a new primary.
    const ecStarted = Boolean(form.ecName.trim());
    if (ecStarted) {
      if (primaryContact) {
        updateEmergencyContact(employee.id, primaryContact.id, {
          name: form.ecName.trim(),
          relationship: form.ecRelationship.trim(),
          phone: form.ecPhone.trim(),
          email: form.ecEmail.trim() || undefined,
          isPrimary: true,
        });
      } else {
        addEmergencyContact(employee.id, {
          name: form.ecName.trim(),
          relationship: form.ecRelationship.trim(),
          phone: form.ecPhone.trim(),
          email: form.ecEmail.trim() || undefined,
          isPrimary: true,
        });
      }
    }

    toast.success("Profile updated", { description: `${fullName(employee)}'s details were saved.` });
    onClose();
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Edit ${fullName(employee)}`}
      description="Update personal, contact, and emergency information."
      isDirty={dirty}
      footer={
        <DrawerFooterActions>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Save changes</Button>
        </DrawerFooterActions>
      }
    >
      <div className="space-y-6">
        <section className="space-y-4">
          <SectionHeading icon={User}>Personal information</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ActionField label="First name" required error={displayErrors.firstName}>
              {({ id, invalid }) => (
                <Input id={id} value={form.firstName} onChange={(e) => patch({ firstName: e.target.value })} className={cn(invalid && invalidRing)} />
              )}
            </ActionField>
            <ActionField label="Middle name">
              {({ id }) => (
                <Input id={id} value={form.middleName} onChange={(e) => patch({ middleName: e.target.value })} placeholder="Optional" />
              )}
            </ActionField>
            <ActionField label="Last name" required error={displayErrors.lastName}>
              {({ id, invalid }) => (
                <Input id={id} value={form.lastName} onChange={(e) => patch({ lastName: e.target.value })} className={cn(invalid && invalidRing)} />
              )}
            </ActionField>
            <ActionField label="Preferred name">
              {({ id }) => (
                <Input id={id} value={form.preferredName} onChange={(e) => patch({ preferredName: e.target.value })} placeholder="Optional" />
              )}
            </ActionField>
            <ActionField label="Birth date">
              {() => (
                <DatePicker value={form.dateOfBirth} onChange={(v) => patch({ dateOfBirth: v })} max={new Date().toISOString().slice(0, 10)} />
              )}
            </ActionField>
            <ActionField label="Gender">
              {() => (
                <Select options={GENDER_OPTIONS} value={form.gender || null} onChange={(v) => patch({ gender: v ?? "" })} placeholder="Select" />
              )}
            </ActionField>
            <ActionField label="Civil status">
              {() => (
                <Select options={CIVIL_OPTIONS} value={form.maritalStatus || null} onChange={(v) => patch({ maritalStatus: v ?? "" })} placeholder="Select" />
              )}
            </ActionField>
            <ActionField label="Nationality">
              {({ id }) => (
                <Input id={id} value={form.nationality} onChange={(e) => patch({ nationality: e.target.value })} />
              )}
            </ActionField>
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading icon={Contact}>Contact</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ActionField label="Personal email" error={displayErrors.personalEmail}>
              {({ id, invalid }) => (
                <Input id={id} type="email" value={form.personalEmail} onChange={(e) => patch({ personalEmail: e.target.value })} className={cn(invalid && invalidRing)} placeholder="Optional" />
              )}
            </ActionField>
            <ActionField label="Work email" required error={displayErrors.workEmail}>
              {({ id, invalid }) => (
                <Input id={id} type="email" value={form.workEmail} onChange={(e) => patch({ workEmail: e.target.value })} className={cn(invalid && invalidRing)} />
              )}
            </ActionField>
            <ActionField label="Mobile" error={displayErrors.phone}>
              {({ id, invalid }) => (
                <Input id={id} value={form.phone} onChange={(e) => patch({ phone: e.target.value })} className={cn(invalid && invalidRing)} placeholder="+63 917 000 0000" />
              )}
            </ActionField>
            <ActionField label="Address" className="sm:col-span-2">
              {({ id }) => (
                <Textarea id={id} value={form.address} onChange={(e) => patch({ address: e.target.value })} rows={2} placeholder="Optional" />
              )}
            </ActionField>
          </div>
        </section>

        <section className="space-y-4">
          <SectionHeading icon={Phone}>Emergency contact</SectionHeading>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ActionField label="Name" error={displayErrors.ecName}>
              {({ id, invalid }) => (
                <Input id={id} value={form.ecName} onChange={(e) => patch({ ecName: e.target.value })} className={cn(invalid && invalidRing)} placeholder="Optional" />
              )}
            </ActionField>
            <ActionField label="Relationship" error={displayErrors.ecRelationship}>
              {({ id, invalid }) => (
                <Input id={id} value={form.ecRelationship} onChange={(e) => patch({ ecRelationship: e.target.value })} className={cn(invalid && invalidRing)} />
              )}
            </ActionField>
            <ActionField label="Mobile" error={displayErrors.ecPhone}>
              {({ id, invalid }) => (
                <Input id={id} value={form.ecPhone} onChange={(e) => patch({ ecPhone: e.target.value })} className={cn(invalid && invalidRing)} />
              )}
            </ActionField>
            <ActionField label="Email" error={displayErrors.ecEmail}>
              {({ id, invalid }) => (
                <Input id={id} type="email" value={form.ecEmail} onChange={(e) => patch({ ecEmail: e.target.value })} className={cn(invalid && invalidRing)} placeholder="Optional" />
              )}
            </ActionField>
            <ActionField label="Address" className="sm:col-span-2">
              {({ id }) => (
                <Textarea id={id} value={form.ecAddress} onChange={(e) => patch({ ecAddress: e.target.value })} rows={2} placeholder="Optional" />
              )}
            </ActionField>
          </div>
        </section>
      </div>
    </Drawer>
  );
}