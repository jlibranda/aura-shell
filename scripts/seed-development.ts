import { PrismaClient } from "@prisma/client";
import { seedDevelopmentPeople } from "@/platform/people/persistence/development-people-seed";

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await seedDevelopmentPeople(prisma);
    console.log(`Development People seed ${result.state}: ${result.employeeCount} approved synthetic employees.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Development People seed failed.");
  process.exitCode = 1;
});
