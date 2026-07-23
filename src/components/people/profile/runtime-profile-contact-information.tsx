import type { ContactInformationResult } from "@/platform/people/profile-runtime-loader";

export function RuntimeProfileContactInformation({
  contactInformation,
}: {
  contactInformation: ContactInformationResult;
}) {
  return (
    <section aria-labelledby="contact-information-heading" className="rounded-xl border border-border bg-surface p-6">
      <h2 id="contact-information-heading" className="text-lg font-semibold text-foreground">Contact Information</h2>
      {contactInformation.kind === "ready" ? (
        <dl className="mt-5">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Work email</dt>
            <dd className="mt-1 text-sm text-foreground">
              <a className="text-primary hover:underline" href={`mailto:${contactInformation.contact.workEmail}`}>
                {contactInformation.contact.workEmail}
              </a>
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground" role="status">
          {contactInformation.kind === "unauthorized"
            ? "You are not authorized to view contact information."
            : "Contact information is temporarily unavailable."}
        </p>
      )}
    </section>
  );
}
