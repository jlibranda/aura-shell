import { PeopleSubNav } from "@/components/people/people-sub-nav";
import { Toaster } from "@/components/ui/toast";

export default function PeopleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <PeopleSubNav />
      <div>{children}</div>
      <Toaster />
    </div>
  );
}