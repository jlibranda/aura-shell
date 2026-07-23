import type { Prisma } from "@prisma/client";

/** The subset of Prisma exposed to the employee persistence adapters. */
export type PrismaEmployeePersistenceClient = Pick<Prisma.TransactionClient, "employee" | "tenant">;

/** The subset of Prisma exposed to the immutable audit persistence adapter. */
export type PrismaAuditPersistenceClient = Pick<Prisma.TransactionClient, "auditRecord">;

/** The subset of Prisma exposed to transactional outbox persistence. */
export type PrismaOutboxPersistenceClient = Pick<Prisma.TransactionClient, "outboxMessage">;

/** A Prisma client able to own an interactive transaction. */
export interface PrismaTransactionRunner {
  $transaction<TResult>(operation: (transaction: Prisma.TransactionClient) => Promise<TResult>): Promise<TResult>;
}

/**
 * The generated Prisma client satisfies these structural contracts. Keeping the
 * adapter surface narrow also prevents UI code from reaching arbitrary tables.
 */
export type PrismaEmployeeUnitOfWorkClient = PrismaTransactionRunner;
