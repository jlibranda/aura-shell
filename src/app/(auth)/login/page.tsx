"use client";

import { Suspense, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FormField, Input, PasswordInput } from "@/components/ui/form";
import { useAuthStore } from "@/stores/auth-store";
import { loginAction } from "@/app/(auth)/login/actions";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

// useSearchParams() (for the post-login returnTo target) requires a Suspense
// boundary or Next.js can't statically prerender this route.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const signIn = useAuthStore((s) => s.signIn);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    if (!IS_PRODUCTION) {
      // Development keeps the existing mock click-through experience —
      // no server round trip, matching the shell's original design.
      signIn();
      router.push("/home");
      return;
    }

    try {
      const email = emailRef.current?.value ?? "";
      const password = passwordRef.current?.value ?? "";
      const returnTo = searchParams.get("returnTo") ?? undefined;
      const result = await loginAction(email, password, returnTo);
      // loginAction redirects on success (throwing Next's navigation signal),
      // so reaching this line means it returned an error result.
      if (result.kind === "error") setError(result.message);
    } catch (err) {
      // Next's redirect() throws to trigger navigation; let it propagate.
      if (err && typeof err === "object" && "digest" in err && typeof (err as { digest?: unknown }).digest === "string" && (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")) throw err;
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your AURA workspace."
      footer={
        <>
          Need an account?{" "}
          <span className="font-medium text-foreground">Contact your admin</span>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <FormField label="Work email">
          {({ id }) => (
            <Input
              id={id}
              ref={emailRef}
              type="email"
              autoComplete="email"
              placeholder="maria.santos@northwind.ph"
              defaultValue={IS_PRODUCTION ? undefined : "maria.santos@northwind.ph"}
              required
            />
          )}
        </FormField>

        <FormField
          label="Password"
          hint=""
        >
          {({ id }) => (
            <PasswordInput
              id={id}
              ref={passwordRef}
              autoComplete="current-password"
              placeholder="••••••••"
              defaultValue={IS_PRODUCTION ? undefined : "demo-password"}
              required
            />
          )}
        </FormField>

        {error ? (
          <p role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 rounded border-input text-primary focus-visible:outline-none"
            />
            Remember me
          </label>
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      {!IS_PRODUCTION ? (
        <p className="mt-6 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
          Demo build — authentication is not real. Any sign-in continues to the app.
        </p>
      ) : null}
    </AuthCard>
  );
}
