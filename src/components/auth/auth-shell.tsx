import { Sparkles, ShieldCheck, Globe2, Zap } from "lucide-react";

const HIGHLIGHTS = [
  { icon: ShieldCheck, text: "Compliant Philippine payroll, correct by default" },
  { icon: Zap, text: "An AI Copilot woven through every module" },
  { icon: Globe2, text: "Built for one country today, the world tomorrow" },
];

/** Marketing / brand side of the auth screens — home of the aura signature. */
export function AuthBrandingPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-surface lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-12">
      <div className="aura-glow pointer-events-none absolute inset-0 opacity-90" />
      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-aura">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-foreground">
            AURA
          </span>
        </div>
      </div>

      <div className="relative max-w-md">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight text-foreground">
          The operating system for the modern workforce.
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
          One system to pay people accurately, stay compliant, and answer any
          question about your workforce — just by asking.
        </p>

        <ul className="mt-8 space-y-3">
          {HIGHLIGHTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-foreground">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-4 w-4" />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative text-xs text-muted-foreground">
        © 2025 AURA · Payroll &amp; Workforce Platform
      </div>
    </div>
  );
}

export function AuthCard({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        {/* Mobile brand */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-aura">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold tracking-tight text-foreground">
            AURA
          </span>
        </div>

        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>

        <div className="mt-8">{children}</div>

        {footer ? (
          <div className="mt-6 text-center text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
