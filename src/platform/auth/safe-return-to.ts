/**
 * Only an internal, same-origin relative path is ever honored — never an
 * absolute URL, protocol-relative URL, or anything else that could send a
 * signed-in user off-site immediately after login.
 */
export function safeReturnTo(returnTo: string | undefined | null): string {
  if (!returnTo) return "/home";
  if (!returnTo.startsWith("/")) return "/home";
  if (returnTo.startsWith("//")) return "/home";
  if (returnTo.includes("://")) return "/home";
  if (returnTo.includes("\\")) return "/home";
  return returnTo;
}
