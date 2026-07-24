import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";
import type {
  ConfigurationWriteRepository,
  CreateDefinitionInput,
  CreateDraftVersionInput,
  PublishVersionInput,
  UpdateDraftVersionInput,
} from "@/platform/configuration/configuration-repository";
import type { ConfigurationDefinitionRecord, ConfigurationVersionRecord } from "@/platform/configuration/configuration-version";
import {
  createConfigurationDraftCreatedEvent,
  createConfigurationDraftDiscardedEvent,
  createConfigurationDraftUpdatedEvent,
  createConfigurationVersionPublishedEvent,
  createConfigurationVersionRetiredEvent,
} from "@/platform/configuration/configuration-events";

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };

/**
 * Transaction-scoped decorator around a ConfigurationWriteRepository that
 * buffers one DomainEvent per successful mutation, mirroring
 * PrismaEmployeeAggregateTransaction's pullEvents()/clearEvents() contract so
 * PrismaConfigurationUnitOfWork can commit writes, audits, and outbox
 * messages atomically and only release events after that commit succeeds.
 */
export class ConfigurationWriteTransaction implements ConfigurationWriteRepository {
  private readonly events: DomainEvent[] = [];

  constructor(
    private readonly repository: ConfigurationWriteRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    private readonly eventClock: DomainEventClock = systemClock,
  ) {}

  findDefinitionByCode(tenantId: string, code: string): Promise<ConfigurationDefinitionRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findDefinitionByCode(tenantId, code);
  }

  createDefinition(input: CreateDefinitionInput): Promise<ConfigurationDefinitionRecord> {
    this.assertTenant(input.tenantId);
    return this.repository.createDefinition(input);
  }

  findDraftVersion(tenantId: string, definitionId: string): Promise<ConfigurationVersionRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.findDraftVersion(tenantId, definitionId);
  }

  getVersionById(tenantId: string, versionId: string): Promise<ConfigurationVersionRecord | undefined> {
    this.assertTenant(tenantId);
    return this.repository.getVersionById(tenantId, versionId);
  }

  async createDraftVersion(input: CreateDraftVersionInput): Promise<ConfigurationVersionRecord> {
    this.assertTenant(input.tenantId);
    const version = await this.repository.createDraftVersion(input);
    this.events.push(createConfigurationDraftCreatedEvent(version, this.eventContext(), this.eventIds, this.eventClock));
    return version;
  }

  async updateDraftVersion(input: UpdateDraftVersionInput): Promise<ConfigurationVersionRecord | "stale" | "not_found"> {
    this.assertTenant(input.tenantId);
    const result = await this.repository.updateDraftVersion(input);
    if (result !== "stale" && result !== "not_found") {
      this.events.push(createConfigurationDraftUpdatedEvent(result, this.eventContext(), this.eventIds, this.eventClock));
    }
    return result;
  }

  async discardDraftVersion(tenantId: string, versionId: string, expectedUpdatedAt: string): Promise<"discarded" | "stale" | "not_found"> {
    this.assertTenant(tenantId);
    const version = await this.repository.getVersionById(tenantId, versionId);
    const result = await this.repository.discardDraftVersion(tenantId, versionId, expectedUpdatedAt);
    if (result === "discarded" && version) {
      this.events.push(createConfigurationDraftDiscardedEvent(version, this.eventContext(), this.eventIds, this.eventClock));
    }
    return result;
  }

  findPublishedVersions(tenantId: string, definitionId: string): Promise<ConfigurationVersionRecord[]> {
    this.assertTenant(tenantId);
    return this.repository.findPublishedVersions(tenantId, definitionId);
  }

  async publishVersion(input: PublishVersionInput): Promise<ConfigurationVersionRecord | "stale" | "not_found"> {
    this.assertTenant(input.tenantId);
    const result = await this.repository.publishVersion(input);
    if (result !== "stale" && result !== "not_found") {
      this.events.push(createConfigurationVersionPublishedEvent(result, this.eventContext(), this.eventIds, this.eventClock));
    }
    return result;
  }

  async retireVersion(tenantId: string, versionId: string): Promise<void> {
    this.assertTenant(tenantId);
    const version = await this.repository.getVersionById(tenantId, versionId);
    await this.repository.retireVersion(tenantId, versionId);
    if (version && version.status === "PUBLISHED") {
      this.events.push(createConfigurationVersionRetiredEvent({ ...version, status: "RETIRED" }, this.eventContext(), this.eventIds, this.eventClock));
    }
  }

  nextVersionNumber(tenantId: string, definitionId: string): Promise<number> {
    this.assertTenant(tenantId);
    return this.repository.nextVersionNumber(tenantId, definitionId);
  }

  pullEvents(): readonly DomainEvent[] { return this.events.splice(0, this.events.length); }
  clearEvents(): void { this.events.length = 0; }

  private eventContext(): Readonly<{ tenantId: string; correlationId: string }> {
    return Object.freeze({ tenantId: this.context.tenantId, correlationId: this.context.correlationId });
  }

  private assertTenant(tenantId: string): void {
    if (tenantId !== this.context.tenantId) {
      throw Object.freeze({ code: "TENANT_MISMATCH", message: "Transaction access must use its trusted tenant." });
    }
  }
}
