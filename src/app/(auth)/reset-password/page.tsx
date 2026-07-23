"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { FormField, PasswordInput } from "@/components/ui/form";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const mismatch = confirm.length > 0 && password !== confirm;

  if (done) {
    return (
      <AuthCard
        title="Password updated"
        subtitle="Your password has been changed. You can now sign in."
      >
        <div className="flex flex-col items-center rounded-xl border border-border bg-surface-muted/40 px-6 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-success/10 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <Button className="mt-6" onClick={() => router.push("/login")}>
            Continue to sign in
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="Your new password must be at least 8 characters."
      footer={
        <Link href="/login" className="font-medium text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!mismatch && password.length >= 8) setDone(true);
        }}
        className="space-y-4"
      >
        <FormField label="New password">
          {({ id }) => (
            <PasswordInput
              id={id}
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}
        </FormField>
        <FormField label="Confirm password" error={mismatch ? "Passwords don't match." : undefined}>
          {({ id }) => (
            <PasswordInput
              id={id}
              autoComplete="new-password"
              placeholder="Re-enter your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          )}
        </FormField>
        <Button type="submit" size="lg" className="w-full">
          Update password
        </Button>
      </form>
    </AuthCard>
  );
}
