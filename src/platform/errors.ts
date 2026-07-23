export class ApplicationError extends Error { constructor(public readonly code: string, message: string, public readonly metadata?: Record<string, unknown>) { super(message); } }
export class ValidationError extends ApplicationError { constructor(message: string, metadata?: Record<string, unknown>) { super("VALIDATION", message, metadata); } }
export class AuthenticationError extends ApplicationError { constructor(message = "Authentication is required.") { super("UNAUTHENTICATED", message); } }
export class AuthorizationError extends ApplicationError { constructor(message = "You are not authorized to perform this action.") { super("FORBIDDEN", message); } }
export class NotFoundError extends ApplicationError { constructor(resource: string) { super("NOT_FOUND", `${resource} was not found.`); } }
export class ConflictError extends ApplicationError { constructor(message: string) { super("CONFLICT", message); } }
