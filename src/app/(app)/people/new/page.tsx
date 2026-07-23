import { redirect } from "next/navigation";

export default function NewEmployeeRedirect() {
  redirect("/people/hire");
}