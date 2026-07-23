import type { ApplicationCommand, CommandHandler } from "@/platform/commands/application-command";
import { commandAuthorizationFailure, commandInfrastructureFailure, commandUnexpectedFailure, type CommandResult } from "@/platform/commands/command-result";
import type { AuthorizationPolicy } from "@/platform/authorization/authorization-policy";
import type { TrustedRequestContext } from "@/platform/runtime-context";

type RegisteredHandler = CommandHandler<ApplicationCommand, unknown>;

/** Request-scoped dispatcher. It deliberately has no repository or transport access. */
export class CommandExecutionPipeline {
  private readonly handlers: ReadonlyMap<string, RegisteredHandler>;

  constructor(private readonly authorizationPolicy: AuthorizationPolicy, handlers: readonly RegisteredHandler[]) {
    this.handlers = new Map(handlers.map((handler) => [handler.commandType, handler]));
  }

  async execute<TCommand extends ApplicationCommand, TValue>(request: TrustedRequestContext, command: TCommand): Promise<CommandResult<TValue>> {
    const decision = this.authorizationPolicy.authorize(request, command);
    if (decision.kind === "denied") return commandAuthorizationFailure(decision.message);
    const handler = this.handlers.get(command.type);
    if (!handler) return commandInfrastructureFailure(`No command handler is registered for ${command.type}.`);

    try {
      return await handler.execute(request, command) as CommandResult<TValue>;
    } catch {
      return commandUnexpectedFailure();
    }
  }
}
