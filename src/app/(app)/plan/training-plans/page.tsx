import { redirect } from "next/navigation";
import { trainingPlansHref } from "@/lib/plan/library-href";

export default function LegacyTrainingPlansRedirect() {
  redirect(trainingPlansHref());
}
