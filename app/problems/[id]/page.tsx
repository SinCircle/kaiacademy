import type { Metadata } from "next";
import { ProblemDetailScreen } from "../../components/ProblemDetailScreen";

export const metadata: Metadata = { title: "问题详情" };
export default async function ProblemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProblemDetailScreen problemId={id} />;
}
