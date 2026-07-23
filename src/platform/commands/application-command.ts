import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { CommandResult } from "@/platform/commands/command-result";

/** A framework-free description of requested business intent. */
export interface ApplicationCommand<TType extends string = string> {
  readonly type: TType;
}

/**
 * Handlers receive only the verified request context and a command. Repository,
 * transaction, audit, and notification dependencies belong to later slices.
 */
export interface CommandHandler<TCommand extends ApplicationCommand, TValue = never> {
  readonly commandType: TCommand["type"];
  execute(request: TrustedRequestContext, command: TCommand): Promise<CommandResult<TValue>> | CommandResult<TValue>;
}
