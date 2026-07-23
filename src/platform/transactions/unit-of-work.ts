/** Server-owned context propagated through one atomic application operation. */
export type UnitOfWorkContext = Readonly<{
  tenantId: string;
  correlationId: string;
  requestId?: string;
  actorUserId?: string;
  commandName?: string;
}>;

export type UnitOfWorkTransactionContext = Readonly<UnitOfWorkContext & {
  transactionId: string;
}>;

/** Repositories bound to a single transaction lifecycle. */
export type UnitOfWorkTransaction<TRepositories> = Readonly<{
  context: UnitOfWorkTransactionContext;
  repositories: TRepositories;
}>;

/**
 * Application transaction boundary. Implementations commit after a successful
 * operation and roll back when the operation fails. Handlers never commit
 * repositories directly.
 */
export interface UnitOfWork<TRepositories> {
  execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<TRepositories>) => Promise<TResult>,
  ): Promise<TResult>;
}
