import { PrismaClient } from "@prisma/client";
import { hashPassword, isPasswordAcceptable } from "@/platform/auth/password";
import { PrismaUserRepository } from "@/platform/auth/prisma-user-repository";

/**
 * Explicit, server-only production administrator bootstrap. This is a
 * distinct command from `npm run seed:development` (which seeds 48 fake
 * employees and is itself blocked outside AURA_SEED_ENV=development) — this
 * script creates exactly one real login identity and never touches Employee
 * records, HR data, or the mock seed at all.
 *
 * Required environment variables (never CLI arguments — arguments are
 * visible to every other process on the host via `ps`):
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PASSWORD
 *   BOOTSTRAP_ADMIN_TENANT_ID
 *   BOOTSTRAP_ADMIN_ROLES        (comma-separated PlatformRole values; defaults to hr_admin)
 *   BOOTSTRAP_RESET_PASSWORD     ("true" to update an already-existing user's password)
 */
async function main(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const tenantId = process.env.BOOTSTRAP_ADMIN_TENANT_ID?.trim();
  const roles = (process.env.BOOTSTRAP_ADMIN_ROLES?.trim() || "hr_admin").split(",").map((role) => role.trim()).filter(Boolean);
  const resetPassword = process.env.BOOTSTRAP_RESET_PASSWORD === "true";

  if (!email || !password || !tenantId) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, and BOOTSTRAP_ADMIN_TENANT_ID are all required.");
  }

  const strength = isPasswordAcceptable(password);
  if (!strength.ok) throw new Error(strength.reason);

  const prisma = new PrismaClient();
  try {
    const users = new PrismaUserRepository(prisma);
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new Error(`Tenant "${tenantId}" does not exist. Create it before bootstrapping an administrator.`);

    const existing = await users.findByEmail(email);
    if (existing && !resetPassword) {
      await users.upsertMembership({ userId: existing.id, tenantId, roles });
      console.log(`User already exists for ${email}; membership for tenant "${tenantId}" ensured. Password unchanged (pass BOOTSTRAP_RESET_PASSWORD=true to rotate it).`);
      return;
    }

    const { hash, salt } = await hashPassword(password);

    if (existing) {
      await prisma.user.update({ where: { id: existing.id }, data: { passwordHash: hash, passwordSalt: salt, status: "active" } });
      await users.upsertMembership({ userId: existing.id, tenantId, roles });
      console.log(`Password rotated for ${email}; membership for tenant "${tenantId}" ensured.`);
      return;
    }

    const created = await users.createUser({ email, passwordHash: hash, passwordSalt: salt });
    await users.upsertMembership({ userId: created.id, tenantId, roles });
    console.log(`Administrator created for ${email} in tenant "${tenantId}" with roles [${roles.join(", ")}].`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Production administrator bootstrap failed.");
  process.exitCode = 1;
});
