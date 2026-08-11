import type { Metadata } from "next";
import { ProblemEditor } from "../../../components/ProblemEditor";

export const metadata: Metadata = { title: "问题设置" };
export default async function ProblemSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProblemEditor mode="settings" problemId={id} />;
}
