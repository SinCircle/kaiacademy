import type { Metadata } from "next";
import { ProblemDetail } from "../../components/ProblemDetail";

export const metadata: Metadata = {
  title: "问题详情",
};

export default function ProblemPage() {
  return <ProblemDetail />;
}
