import { AuthBrandingPanel } from "@/components/auth/auth-shell";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      <AuthBrandingPanel />
      <main className="flex flex-1 flex-col">{children}</main>
    </div>
  );
}
