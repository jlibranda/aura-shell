"use server";

import { createApplicationRuntime } from "@/platform/application-runtime";
import type { CommandResult } from "@/platform/commands/command-result";
import type { CreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import type { CreateEmployeePreparation } from "@/platform/people/commands/create-employee-command-handler";
import { getDevelopmentRequestContext } from "@/platform/development-session";
import { createTrustedCreateEmployeeSubmissionRuntime } from "@/platform/submissions/trusted-create-employee-submission-runtime";
import type { SubmissionGatewayResult } from "@/platform/submissions/create-employee-submission-gateway";

/**
 * This action is preparation only. Browser form values describe business intent,
 * while actor and tenant provenance are resolved exclusively on the server.
 */
export async function prepareCreateEmployeeCommand(command: CreateEmployeeCommand): Promise<CommandResult<CreateEmployeePreparation>> {
  return createApplicationRuntime(getDevelopmentRequestContext()).commands.executeCreateEmployee(command);
}

/** The single browser-facing adapter; trusted authority is server-owned. */
export async function submitRuntimeHireEmployee(command: CreateEmployeeCommand, idempotencyKey: string): Promise<SubmissionGatewayResult> {
  return createTrustedCreateEmployeeSubmissionRuntime(getDevelopmentRequestContext).submit({ idempotencyKey, command });
}
