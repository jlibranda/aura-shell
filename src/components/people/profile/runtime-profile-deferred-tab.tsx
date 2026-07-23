import { Clock3 } from "lucide-react";

export function RuntimeProfileDeferredTab({ title }: { title: string }) {
  return (
    <section aria-labelledby="deferred-tab-heading" className="rounded-xl border border-border bg-surface p-6 text-center">
      <Clock3 className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <h2 id="deferred-tab-heading" className="mt-3 text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground" role="status">Coming in a future release.</p>
    </section>
  );
}
