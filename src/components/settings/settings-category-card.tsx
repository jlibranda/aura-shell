import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Badge, Card } from "@/components/ui/primitives";
import type { DescribedConfigurationCategory } from "@/platform/configuration/registry/configuration-registry-service";
import { presentSettingsCategory } from "@/components/settings/settings-category-presentation";

/**
 * Presentational card for one described category. It renders registry-provided
 * data only — it holds no category identity, status, or list of its own.
 */
export function SettingsCategoryCard({
  category,
  icon: Icon,
}: {
  category: DescribedConfigurationCategory;
  icon: LucideIcon;
}) {
  const { statusLabel, statusTone, annotations, href, interactive, accessibleStatus } = presentSettingsCategory(category);

  const body = (
    <Card className={interactive ? "flex h-full flex-col gap-3 p-5 transition-shadow hover:shadow-sm" : "flex h-full flex-col gap-3 p-5 opacity-80"}>
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{category.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{category.description}</p>
        {annotations.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {annotations.map((note) => (
              <li key={note} className="text-xs text-muted-foreground">
                {note}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );

  if (!href) {
    return (
      <div aria-disabled="true" aria-label={`${category.title}: ${accessibleStatus}`}>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={`${category.title}: ${accessibleStatus}`}>
      {body}
    </Link>
  );
}
