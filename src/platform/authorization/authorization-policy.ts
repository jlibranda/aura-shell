import type { ApplicationCommand } from "@/platform/commands/application-command";
import type { Permission } from "@/platform/context";
import type { TrustedRequestContext } from "@/platform/runtime-context";

export type AuthorizationDecision =
  | Readonly<{ kind: "allowed" }>
  | Readonly<{ kind: "denied"; code: "UNREGISTERED_OPERATION" | "MISSING_PERMISSION"; message: string }>;

export interface AuthorizationPolicy<TCommand extends ApplicationCommand = ApplicationCommand> {
  authorize(request: TrustedRequestContext, command: TCommand): AuthorizationDecision;
}

export type CommandPermissionRequirements = Readonly<Record<string, Permission>>;

/**
 * Server-composed, deny-by-default command policy. It evaluates only the
 * verified permission snapshot present in TrustedRequestContext.
 */
export class PermissionAuthorizationPolicy implements AuthorizationPolicy {
  constructor(private readonly requirements: CommandPermissionRequirements) {}

  authorize(request: TrustedRequestContext, command: ApplicationCommand): AuthorizationDecision {
    const requiredPermission = this.requirements[command.type];
    if (!requiredPermission) return Object.freeze({ kind: "denied" as const, code: "UNREGISTERED_OPERATION" as const, message: "This operation is not authorized." });
    if (!request.permissions.has(requiredPermission)) return Object.freeze({ kind: "denied" as const, code: "MISSING_PERMISSION" as const, message: "You are not authorized to perform this operation." });
    return Object.freeze({ kind: "allowed" as const });
  }
}

export const AURA_COMMAND_PERMISSION_REQUIREMENTS: CommandPermissionRequirements = Object.freeze({
  "people.employee.create": "people.employee.hire",
  "configuration.general.save_draft": "settings.manage",
  "configuration.general.discard_draft": "settings.manage",
  "configuration.general.publish": "settings.publish",
});
