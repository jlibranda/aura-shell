"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FormField, Input, PasswordInput } from "@/components/ui/form";
import { useAuthStore } from "@/stores/auth-store";

export default function LoginPage() {
  const router = useRouter();
  const signIn = useAuthStore((s) => s.signIn);
  const [loading, setLoading] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // UI-only: there is no real credential check in this build.
    signIn();
    router.push("/home");
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
              type="email"
              autoComplete="email"
              placeholder="maria.santos@northwind.ph"
              defaultValue="maria.santos@northwind.ph"
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
              autoComplete="current-password"
              placeholder="••••••••"
              defaultValue="demo-password"
              required
            />
          )}
        </FormField>

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

      <p className="mt-6 rounded-lg border border-border bg-surface-muted/50 px-3 py-2 text-center text-xs text-muted-foreground">
        Demo build — authentication is not real. Any sign-in continues to the app.
      </p>
    </AuthCard>
  );
}
