import type { TenantContext } from "@/platform/context";
export interface AuditEvent { tenantId: string; actorId: string; actorName: string; correlationId: string; module: string; action: string; targetId?: string; metadata?: Record<string, unknown>; occurredAt: string; }
export interface AuditRepository { append(event: AuditEvent): Promise<void>; }
export class InMemoryAuditRepository implements AuditRepository { readonly events: AuditEvent[] = []; async append(event: AuditEvent): Promise<void> { this.events.push(event); } }
export function auditEvent(context: TenantContext, event: Omit<AuditEvent, "tenantId" | "actorId" | "actorName" | "correlationId" | "occurredAt">): AuditEvent { return { ...event, tenantId: context.tenantId, actorId: context.actorId, actorName: context.actorName, correlationId: context.correlationId, occurredAt: new Date().toISOString() }; }
