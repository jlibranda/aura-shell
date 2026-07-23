"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X, Save } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Stepper } from "@/components/ui/stepper";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { HIRE_STEPS } from "@/components/people/hire/hire-steps";
import { StepPersonal } from "@/components/people/hire/step-personal";
import { StepContact } from "@/components/people/hire/step-contact";
import { StepEmployment } from "@/components/people/hire/step-employment";
import { StepGovernment } from "@/components/people/hire/step-government";
import { StepEmergency } from "@/components/people/hire/step-emergency";
import { StepReview } from "@/components/people/hire/step-review";
import { HireSuccess } from "@/components/people/hire/hire-success";
import { ResumeDraftBanner } from "@/components/people/hire/resume-draft-banner";
import { useHireDraftStore } from "@/stores/hire-draft-store";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import {
  HIRE_STEP_KEYS,
  validateStep,
  draftToHireInput,
  draftToEmergencyContact,
  type FieldErrors,
  type HireStepKey,
} from "@/lib/people/hire-types";

interface Created {
  id: string;
  number: string;
  name: string;
}

export function HireWizard() {
  const router = useRouter();
  const draft = useHireDraftStore((s) => s.draft);
  const hasSavedDraft = useHireDraftStore((s) => s.hasSavedDraft);
  const hydrated = useHireDraftStore((s) => s.hydrated);
  const hydrate = useHireDraftStore((s) => s.hydrate);
  const resumeSaved = useHireDraftStore((s) => s.resumeSaved);
  const discard = useHireDraftStore((s) => s.discard);
  const clear = useHireDraftStore((s) => s.clear);

  const hireEmployee = usePeopleRepository((s) => s.hireEmployee);
  const addEmergencyContact = usePeopleRepository((s) => s.addEmergencyContact);

  const [stepIndex, setStepIndex] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [resumeOffered, setResumeOffered] = useState(true);

  const step = HIRE_STEPS[stepIndex];
  const isReview = step.key === "review";

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  const errors: FieldErrors = useMemo(
    () => (isReview ? {} : validateStep(step.key, draft)),
    [isReview, step.key, draft],
  );

  const stepValid = Object.keys(errors).length === 0;

  const goTo = (index: number) => {
    setShowErrors(false);
    setStepIndex(Math.max(0, Math.min(index, HIRE_STEPS.length - 1)));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => {
    if (!stepValid) {
      setShowErrors(true);
      toast.error("Please complete the required fields", {
        description: "Highlighted fields need your attention before continuing.",
      });
      return;
    }
    goTo(stepIndex + 1);
  };

  const back = () => goTo(stepIndex - 1);

  const editFrom = (target: HireStepKey) => {
    const index = HIRE_STEP_KEYS.indexOf(target);
    if (index >= 0) goTo(index);
  };

  const submit = () => {
    // Re-validate every data step before committing.
    const dataSteps: HireStepKey[] = ["personal", "contact", "employment", "government", "emergency"];
    for (const s of dataSteps) {
      const stepErrors = validateStep(s, draft);
      if (Object.keys(stepErrors).length > 0) {
        setShowErrors(true);
        goTo(HIRE_STEP_KEYS.indexOf(s));
        toast.error("Some details need fixing", {
          description: "We moved you to the step that needs attention.",
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const id = hireEmployee(draftToHireInput(draft));
      const contact = draftToEmergencyContact(draft);
      if (contact) addEmergencyContact(id, contact);

      const employee = usePeopleRepository.getState().employees.find((e) => e.id === id);
      const name = employee ? fullName(employee) : `${draft.personal.firstName} ${draft.personal.lastName}`;
      const number = employee?.employeeNumber ?? "—";

      clear();
      setCreated({ id, number, name });
      toast.success("Employee created", { description: `${name} was added to the directory.` });
    } catch {
      toast.error("Couldn't create the employee", {
        description: "Something went wrong. Please review and try again.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const hireAnother = () => {
    discard();
    setCreated(null);
    setStepIndex(0);
    setShowErrors(false);
    setResumeOffered(false);
  };

  const cancelWizard = () => {
    router.push("/people");
  };

  if (created) {
    return (
      <HireSuccess
        employeeId={created.id}
        employeeNumber={created.number}
        employeeName={created.name}
        onHireAnother={hireAnother}
      />
    );
  }

  const displayErrors = showErrors ? errors : {};

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Hire a new employee</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Complete each step to add someone to your organization. Progress saves automatically.
        </p>
      </div>

      {hydrated && hasSavedDraft && resumeOffered && stepIndex === 0 ? (
        <ResumeDraftBanner
          updatedAt={draft.updatedAt}
          onResume={() => {
            resumeSaved();
            setResumeOffered(false);
            toast("Draft resumed");
          }}
          onDiscard={() => {
            discard();
            setResumeOffered(false);
            toast("Draft discarded");
          }}
        />
      ) : null}

      <Card className="p-5 sm:p-6">
        <Stepper
          steps={HIRE_STEPS.map((s) => ({ key: s.key, label: s.label, description: s.description }))}
          current={stepIndex}
          onStepClick={(index) => {
            if (index < stepIndex) goTo(index);
          }}
          className="mb-6"
        />

        <div className="mb-2">
          <h2 className="text-base font-semibold text-foreground">{step.label}</h2>
          <p className="text-sm text-muted-foreground">{step.description}</p>
        </div>

        <div className="mt-4">
          {step.key === "personal" ? <StepPersonal errors={displayErrors} /> : null}
          {step.key === "contact" ? <StepContact errors={displayErrors} /> : null}
          {step.key === "employment" ? <StepEmployment errors={displayErrors} /> : null}
          {step.key === "government" ? <StepGovernment errors={displayErrors} /> : null}
          {step.key === "emergency" ? <StepEmergency errors={displayErrors} /> : null}
          {step.key === "review" ? <StepReview onEdit={editFrom} /> : null}
        </div>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-5">
          <div>
            {stepIndex > 0 ? (
              <Button variant="ghost" onClick={back} disabled={submitting}>
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDiscard(true)} disabled={submitting}>
                <X className="h-4 w-4" />
                Cancel
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <Save className="h-3.5 w-3.5" />
              Saved
            </span>
            {isReview ? (
              <Button onClick={submit} disabled={submitting}>
                <Check className="h-4 w-4" />
                {submitting ? "Creating…" : "Create employee"}
              </Button>
            ) : (
              <Button onClick={next}>
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this hire?"
        description="Your saved draft will be removed and you'll return to the directory."
        confirmLabel="Discard draft"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => {
          discard();
          setConfirmDiscard(false);
          cancelWizard();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}