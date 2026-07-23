import { redirect } from "next/navigation";

/** Legacy integration URL; the active runtime directory is /people. */
export default function PeopleRuntimeDirectoryRoute() {
  redirect("/people");
}
