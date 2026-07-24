import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME, SESSION_DURATION_MS } from "@/platform/auth/session-cookie-name";

export { SESSION_COOKIE_NAME, SESSION_DURATION_MS };

/** Only callable from a Server Action or Route Handler (Next.js write restriction). */
export function setSessionCookie(token: string): void {
  cookies().set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export function clearSessionCookie(): void {
  cookies().set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

/** Safe to call from Server Components too (read-only). */
export function readSessionToken(): string | undefined {
  return cookies().get(SESSION_COOKIE_NAME)?.value || undefined;
}
