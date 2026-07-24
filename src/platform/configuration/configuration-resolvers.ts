import type { TenantContext } from "@/platform/context";
import type { ConfigurationReadRepository } from "@/platform/configuration/configuration-repository";
import type { ConfigurationVersionRecord } from "@/platform/configuration/configuration-version";
import { GENERAL_COMPANY_SETTINGS_CODE, GENERAL_COMPANY_SETTINGS_TYPE } from "@/platform/configuration/general-company-settings";

/**
 * Maps a stable, human-meaningful configurationType to the definition code
 * it is stored under. Extend this — never the resolver logic — when a new
 * typed settings category is added.
 */
const CONFIGURATION_TYPE_CODES: Readonly<Record<string, string>> = Object.freeze({
  [GENERAL_COMPANY_SETTINGS_TYPE]: GENERAL_COMPANY_SETTINGS_CODE,
});

export interface GetEffectiveConfigurationInput {
  context: TenantContext;
  configurationType: string;
  asOf: Date;
}

export interface GetConfigurationTimelineInput {
  context: TenantContext;
  configurationDefinitionId: string;
}

export interface ConfigurationResolvers {
  /** The currently-in-force version for a configuration type as of a point in time, tenant-scoped. */
  getEffectiveConfiguration(input: GetEffectiveConfigurationInput): Promise<ConfigurationVersionRecord | undefined>;
  /** The full version history (draft, published, scheduled, retired) for one definition, newest first. */
  getConfigurationTimeline(input: GetConfigurationTimelineInput): Promise<readonly ConfigurationVersionRecord[]>;
}

/**
 * Server-only resolver factory. Never accepts browser-supplied roles, actor,
 * or tenant authority — all of that comes from the already-verified
 * TenantContext embedded in each call's input.
 */
export function createConfigurationResolvers(reader: ConfigurationReadRepository): ConfigurationResolvers {
  return Object.freeze({
    async getEffectiveConfiguration({ context, configurationType, asOf }: GetEffectiveConfigurationInput): Promise<ConfigurationVersionRecord | undefined> {
      const code = CONFIGURATION_TYPE_CODES[configurationType];
      if (!code) return undefined;
      const definition = await reader.findDefinitionByCode(context, code);
      if (!definition) return undefined;
      return reader.getEffectiveVersion(context, definition.id, asOf);
    },
    async getConfigurationTimeline({ context, configurationDefinitionId }: GetConfigurationTimelineInput): Promise<readonly ConfigurationVersionRecord[]> {
      return reader.listVersions(context, configurationDefinitionId);
    },
  });
}
