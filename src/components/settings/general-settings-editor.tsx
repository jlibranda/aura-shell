"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/primitives";
import { saveGeneralSettingsDraftAction } from "@/app/(app)/settings/general/actions";
import { DAYS_OF_WEEK, DATE_FORMATS, TIME_FORMATS, type GeneralCompanySettingsPayload, type GeneralCompanySettingsRawInput } from "@/platform/configuration/general-company-settings";

const DAY_LABELS: Record<string, string> = {
  SUNDAY: "Sun", MONDAY: "Mon", TUESDAY: "Tue", WEDNESDAY: "Wed", THURSDAY: "Thu", FRIDAY: "Fri", SATURDAY: "Sat",
};

const COMMON_LOCALES = ["en-US", "en-GB", "en-AU", "en-CA", "en-PH", "fil-PH", "en-SG", "en-IN", "zh-CN", "zh-HK", "ja-JP", "ko-KR", "es-ES", "es-MX", "fr-FR", "de-DE", "pt-BR", "id-ID", "vi-VN", "th-TH"];

function useIntlOptions(kind: "timeZone" | "currency"): string[] {
  return useMemo(() => {
    try {
      return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf(kind) : [];
    } catch {
      return [];
    }
  }, [kind]);
}

type FieldErrors = Record<string, string>;

export function GeneralSettingsEditor({
  initialPayload,
  versionId,
  expectedUpdatedAt,
}: {
  initialPayload?: GeneralCompanySettingsPayload;
  versionId?: string;
  expectedUpdatedAt?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [warnings, setWarnings] = useState<{ path: string[]; message: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState<GeneralCompanySettingsRawInput>({
    displayName: initialPayload?.displayName ?? "",
    legalName: initialPayload?.legalName ?? "",
    timeZone: initialPayload?.timeZone ?? "",
    locale: initialPayload?.locale ?? "",
    currency: initialPayload?.currency ?? "",
    firstDayOfWeek: initialPayload?.firstDayOfWeek ?? "MONDAY",
    workingDays: initialPayload?.workingDays ?? [],
    dateFormat: initialPayload?.dateFormat ?? "YYYY-MM-DD",
    timeFormat: initialPayload?.timeFormat ?? "24H",
    companyCode: initialPayload?.companyCode ?? "",
    primaryCountryCode: initialPayload?.primaryCountryCode ?? "",
  });

  const timeZones = useIntlOptions("timeZone");
  const currencies = useIntlOptions("currency");

  function update<K extends keyof GeneralCompanySettingsRawInput>(key: K, value: GeneralCompanySettingsRawInput[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleWorkingDay(day: string) {
    setForm((prev) => {
      const days = prev.workingDays ?? [];
      const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
      return { ...prev, workingDays: next };
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaved(false);
    startTransition(async () => {
      const result = await saveGeneralSettingsDraftAction({ payload: form, versionId, expectedUpdatedAt, changeReason: undefined });
      if (result.kind === "validation_failure") {
        const next: FieldErrors = {};
        for (const issue of result.issues) next[issue.path.join(".")] = issue.message;
        setErrors(next);
        return;
      }
      if (result.kind === "conflict") {
        setErrors({ _form: result.message });
        return;
      }
      if (result.kind !== "success") {
        setErrors({ _form: "The draft could not be saved. Please try again." });
        return;
      }
      setErrors({});
      setWarnings(result.value.warnings.map((warning) => ({ path: warning.path, message: warning.message })));
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card className="space-y-6 p-5">
        {errors._form ? (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            {errors._form}
          </div>
        ) : null}

        <Field id="display-name" label="Display name" hint="The name your team will see across AURA." error={errors.displayName}>
          <input
            id="display-name"
            type="text"
            value={form.displayName ?? ""}
            onChange={(event) => update("displayName", event.target.value)}
            className={inputClass(Boolean(errors.displayName))}
            aria-invalid={Boolean(errors.displayName)}
          />
        </Field>

        <Field id="legal-name" label="Legal / registered name" hint="Optional — only if different from the display name." error={errors.legalName}>
          <input
            id="legal-name"
            type="text"
            value={form.legalName ?? ""}
            onChange={(event) => update("legalName", event.target.value)}
            className={inputClass(Boolean(errors.legalName))}
          />
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="time-zone" label="Time zone" hint="Used to schedule and time-stamp events across AURA." error={errors.timeZone} warning={warnings.find((w) => w.path[0] === "timeZone")?.message}>
            <input
              id="time-zone"
              type="text"
              list="timezone-options"
              value={form.timeZone ?? ""}
              onChange={(event) => update("timeZone", event.target.value)}
              placeholder="e.g. Asia/Manila"
              className={inputClass(Boolean(errors.timeZone))}
              aria-invalid={Boolean(errors.timeZone)}
            />
            <datalist id="timezone-options">
              {timeZones.map((zone) => <option key={zone} value={zone} />)}
            </datalist>
          </Field>

          <Field id="locale" label="Locale" hint="Controls how dates, numbers, and names are displayed." error={errors.locale}>
            <input
              id="locale"
              type="text"
              list="locale-options"
              value={form.locale ?? ""}
              onChange={(event) => update("locale", event.target.value)}
              placeholder="e.g. en-PH"
              className={inputClass(Boolean(errors.locale))}
              aria-invalid={Boolean(errors.locale)}
            />
            <datalist id="locale-options">
              {COMMON_LOCALES.map((locale) => <option key={locale} value={locale} />)}
            </datalist>
          </Field>

          <Field id="currency" label="Currency" hint="The default currency used across AURA." error={errors.currency}>
            <input
              id="currency"
              type="text"
              list="currency-options"
              value={form.currency ?? ""}
              onChange={(event) => update("currency", event.target.value.toUpperCase())}
              placeholder="e.g. PHP"
              className={inputClass(Boolean(errors.currency))}
              aria-invalid={Boolean(errors.currency)}
            />
            <datalist id="currency-options">
              {currencies.map((currency) => <option key={currency} value={currency} />)}
            </datalist>
          </Field>

          <Field id="primary-country" label="Primary country" hint="Optional. Helps flag mismatched time zones." error={errors.primaryCountryCode}>
            <input
              id="primary-country"
              type="text"
              maxLength={2}
              value={form.primaryCountryCode ?? ""}
              onChange={(event) => update("primaryCountryCode", event.target.value.toUpperCase())}
              placeholder="e.g. PH"
              className={inputClass(Boolean(errors.primaryCountryCode))}
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field id="first-day-of-week" label="First day of week" error={errors.firstDayOfWeek}>
            <select id="first-day-of-week" value={form.firstDayOfWeek ?? ""} onChange={(event) => update("firstDayOfWeek", event.target.value)} className={inputClass(Boolean(errors.firstDayOfWeek))}>
              {DAYS_OF_WEEK.map((day) => <option key={day} value={day}>{DAY_LABELS[day]}</option>)}
            </select>
          </Field>

          <Field id="working-days" label="Working days" error={errors.workingDays} warning={warnings.find((w) => w.path[0] === "workingDays")?.message}>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Working days">
              {DAYS_OF_WEEK.map((day) => {
                const active = (form.workingDays ?? []).includes(day);
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => toggleWorkingDay(day)}
                    aria-pressed={active}
                    className={`h-8 rounded-md border px-3 text-xs font-medium transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-surface text-muted-foreground hover:bg-surface-muted"}`}
                  >
                    {DAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field id="date-format" label="Date format" error={errors.dateFormat}>
            <select id="date-format" value={form.dateFormat ?? ""} onChange={(event) => update("dateFormat", event.target.value)} className={inputClass(Boolean(errors.dateFormat))}>
              {DATE_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}
            </select>
          </Field>

          <Field id="time-format" label="Time format" error={errors.timeFormat}>
            <select id="time-format" value={form.timeFormat ?? ""} onChange={(event) => update("timeFormat", event.target.value)} className={inputClass(Boolean(errors.timeFormat))}>
              {TIME_FORMATS.map((format) => <option key={format} value={format}>{format === "24H" ? "24-hour" : "12-hour"}</option>)}
            </select>
          </Field>

          <Field id="company-code" label="Company code" hint="A short internal code (2-10 letters/numbers)." error={errors.companyCode}>
            <input
              id="company-code"
              type="text"
              value={form.companyCode ?? ""}
              onChange={(event) => update("companyCode", event.target.value.toUpperCase())}
              className={inputClass(Boolean(errors.companyCode))}
              aria-invalid={Boolean(errors.companyCode)}
            />
          </Field>
        </div>

        {saved ? (
          <div role="status" className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
            Draft saved. Nothing is live yet — review and publish when you&apos;re ready.
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
          <Link href="/settings/general" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Cancel
          </Link>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save draft"}</Button>
            {saved ? (
              <Button asChild variant="secondary">
                <Link href="/settings/general/review">Review and publish</Link>
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </form>
  );
}

function inputClass(hasError: boolean): string {
  return `h-10 w-full rounded-md border bg-surface px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary ${hasError ? "border-danger" : "border-border"}`;
}

function Field({
  id,
  label,
  hint,
  error,
  warning,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  warning?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-1.5">{children}</div>
      {error ? <p className="mt-1 text-xs text-danger" role="alert">{error}</p> : null}
      {!error && warning ? <p className="mt-1 text-xs text-warning">{warning}</p> : null}
    </div>
  );
}
