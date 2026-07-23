export interface ValidationIssue { path: string[]; code: string; message: string; }
export type ValidationResult<T> = { success: true; data: T } | { success: false; issues: ValidationIssue[] };
export interface Validator<TInput, TOutput = TInput> { validate(input: TInput): ValidationResult<TOutput>; }
export type FormErrors = Record<string, string>;

export function valid<T>(data: T): ValidationResult<T> { return { success: true, data }; }
export function invalid<T = never>(issues: ValidationIssue[]): ValidationResult<T> { return { success: false, issues }; }
export function issue(path: string | string[], code: string, message: string): ValidationIssue { return { path: Array.isArray(path) ? path : path.split("."), code, message }; }
export function toFormErrors(issues: ValidationIssue[]): FormErrors { return issues.reduce<FormErrors>((errors, current) => ({ ...errors, [current.path.join(".")]: current.message }), {}); }
export function combineValidation<T>(...results: ValidationResult<T>[]): ValidationResult<T> { const issues = results.flatMap((result) => result.success ? [] : result.issues); return issues.length ? invalid<T>(issues) : results.find((result): result is { success: true; data: T } => result.success) ?? valid({} as T); }
