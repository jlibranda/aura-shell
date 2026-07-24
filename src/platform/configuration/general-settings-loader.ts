import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createPrismaConfigurationReadRuntime } from "@/platform/configuration/prisma-configuration-read-runtime";
import { GENERAL_COMPANY_SETTINGS_CODE } from "@/platform/configuration/general-company-settings";
import type { ConfigurationDefinitionRecord, ConfigurationVersionRecord } from "@/platform/configuration/configuration-version";
import type { AuditRecord } from "@/platform/auditing/audit-record";

export type SettingsCategoryStatus = "not_configured" | "draft_in_progress" | "configured";

export interface SettingsHomeViewModel {
  context: TenantContext;
  general: { status: SettingsCategoryStatus; visible: boolean };
  auditVisible: boolean;
}

export type GeneralSettingsViewResult =
  | Readonly<{ kind: "ready"; context: TenantContext; definition?: ConfigurationDefinitionRecord; effective?: ConfigurationVersionRecord; draft?: ConfigurationVersionRecord; nextScheduled?: ConfigurationVersionRecord; canManage: boolean; canPublish: boolean }>
  | Readonly<{ kind: "unauthorized" }>;

export type GeneralSettingsEditResult =
  | Readonly<{ kind: "ready"; context: TenantContext; draft?: ConfigurationVersionRecord; effective?: ConfigurationVersionRecord }>
  | Readonly<{ kind: "unauthorized" }>;

export type GeneralSettingsHistoryResult =
  | Readonly<{ kind: "ready"; context: TenantContext; versions: readonly ConfigurationVersionRecord[] }>
  | Readonly<{ kind: "unauthorized" }>;

export type GeneralSettingsVersionResult =
  | Readonly<{ kind: "ready"; context: TenantContext; version: ConfigurationVersionRecord }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "unauthorized" }>;

export type ConfigurationAuditTrailResult =
  | Readonly<{ kind: "ready"; context: TenantContext; records: readonly AuditRecord[] }>
  | Readonly<{ kind: "unauthorized" }>;

export async function loadSettingsHome(): Promise<SettingsHomeViewModel> {
  const request = await resolveRequestContext();
  const runtime = createPrismaConfigurationReadRuntime(request);
  const { context } = runtime;

  let status: SettingsCategoryStatus = "not_configured";
  if (hasPermission(context, "settings.view")) {
    const definition = await runtime.reader.findDefinitionByCode(context, GENERAL_COMPANY_SETTINGS_CODE);
    if (definition) {
      const [effective, draft] = await Promise.all([
        runtime.reader.getEffectiveVersion(context, definition.id, new Date()),
        runtime.reader.getDraftVersion(context, definition.id),
      ]);
      if (effective) status = "configured";
      else if (draft) status = "draft_in_progress";
    }
  }

  return Object.freeze({
    context,
    general: { status, visible: hasPermission(context, "settings.view") },
    auditVisible: hasPermission(context, "settings.audit.view"),
  });
}

export async function loadGeneralSettingsView(): Promise<GeneralSettingsViewResult> {
  const request = await resolveRequestContext();
  const runtime = createPrismaConfigurationReadRuntime(request);
  const { context } = runtime;
  if (!hasPermission(context, "settings.view")) return Object.freeze({ kind: "unauthorized" as const });

  try {
    const definition = await runtime.reader.findDefinitionByCode(context, GENERAL_COMPANY_SETTINGS_CODE);
    if (!definition) {
      return Object.freeze({ kind: "ready" as const, context, canManage: hasPermission(context, "settings.manage"), canPublish: hasPermission(context, "settings.publish") });
    }
    const [effective, draft, nextScheduled] = await Promise.all([
      runtime.reader.getEffectiveVersion(context, definition.id, new Date()),
      runtime.reader.getDraftVersion(context, definition.id),
      runtime.reader.getNextScheduledVersion(context, definition.id, new Date()),
    ]);
    return Object.freeze({
      kind: "ready" as const,
      context,
      definition,
      effective,
      draft,
      nextScheduled,
      canManage: hasPermission(context, "settings.manage"),
      canPublish: hasPermission(context, "settings.publish"),
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return Object.freeze({ kind: "unauthorized" as const });
    throw error;
  }
}

export async function loadGeneralSettingsEdit(): Promise<GeneralSettingsEditResult> {
  const request = await resolveRequestContext();
  const runtime = createPrismaConfigurationReadRuntime(request);
  const { context } = runtime;
  if (!hasPermission(context, "settings.manage")) return Object.freeze({ kind: "unauthorized" as const });

  const definition = await runtime.reader.findDefinitionByCode(context, GENERAL_COMPANY_SETTINGS_CODE);
  if (!definition) return Object.freeze({ kind: "ready" as const, context });

  const [draft, effective] = await Promise.all([
    runtime.reader.getDraftVersion(context, definition.id),
    runtime.reader.getEffectiveVersion(context, definition.id, new Date()),
  ]);
  return Object.freeze({ kind: "ready" as const, context, draft, effective });
}

export async function loadGeneralSettingsHistory(): Promise<GeneralSettingsHistoryResult> {
  const request = await resolveRequestContext();
  const runtime = createPrismaConfigurationReadRuntime(request);
  const { context } = runtime;
  if (!hasPermission(context, "settings.view")) return Object.freeze({ kind: "unauthorized" as const });

  const definition = await runtime.reader.findDefinitionByCode(context, GENERAL_COMPANY_SETTINGS_CODE);
  if (!definition) return Object.freeze({ kind: "ready" as const, context, versions: [] });

  const versions = await runtime.resolvers.getConfigurationTimeline({ context, configurationDefinitionId: definition.id });
  return Object.freeze({ kind: "ready" as const, context, versions });
}

export async function loadGeneralSettingsVersion(versionId: string): Promise<GeneralSettingsVersionResult> {
  const request = await resolveRequestContext();
  const runtime = createPrismaConfigurationReadRuntime(request);
  const { context } = runtime;
  if (!hasPermission(context, "settings.view")) return Object.freeze({ kind: "unauthorized" as const });

  const version = await runtime.reader.getVersionById(context, versionId);
  if (!version) return Object.freeze({ kind: "not_found" as const });
  return Object.freeze({ kind: "ready" as const, context, version });
}

export async function loadConfigurationAuditTrail(): Promise<ConfigurationAuditTrailResult> {
  const request = await resolveRequestContext();
  const runtime = createPrismaConfigurationReadRuntime(request);
  const { context } = runtime;
  if (!hasPermission(context, "settings.audit.view")) return Object.freeze({ kind: "unauthorized" as const });

  const records = await runtime.auditReader.listConfigurationAuditRecords(context);
  return Object.freeze({ kind: "ready" as const, context, records });
}
