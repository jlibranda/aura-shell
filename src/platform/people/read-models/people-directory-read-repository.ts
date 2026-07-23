import type { TenantContext } from "@/platform/context";
import type { PeopleDirectoryReadModel, PeopleEmploymentStatus } from "@/platform/people/read-models/people-read-models";

export interface PeopleDirectoryReadInput {
  offset: number;
  limit: number;
  query?: string;
  status?: readonly PeopleEmploymentStatus[];
  departmentId?: string;
}

export interface PeopleDirectoryReadResult {
  items: readonly PeopleDirectoryReadModel[];
  offset: number;
  limit: number;
  total: number;
}

/** Server-only port for directory-safe durable reads. */
export interface PeopleDirectoryReadRepository {
  list(context: TenantContext, input: PeopleDirectoryReadInput): Promise<PeopleDirectoryReadResult>;
}
