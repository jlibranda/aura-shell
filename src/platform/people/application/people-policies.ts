import { AuthorizationError } from "@/platform/errors";
import { hasPermission, type Permission, type TenantContext } from "@/platform/context";
export function requirePeoplePermission(context: TenantContext, permission: Permission): void { if (!hasPermission(context, permission)) throw new AuthorizationError(); }
