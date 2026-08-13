import { redirect } from "next/navigation";
import { libraryHref } from "@/lib/plan/library-href";

export default function LegacyComponentsNewRedirect() {
  redirect(libraryHref());
}
