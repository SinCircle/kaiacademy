import type { Metadata } from "next";
import { ProblemDetailScreen } from "../../components/ProblemDetailScreen";
import { isValidProblemShareToken } from "../../../db/problem-share";
import { requirePageMember } from "../../lib/page-auth";

export const metadata: Metadata = { title: "问题详情" };
export default async function ProblemPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const { id } = await params;
  const requestedShareToken = (await searchParams).share?.trim() ?? "";
  const publicShare = await isValidProblemShareToken(id, requestedShareToken);
  if (!publicShare) await requirePageMember(`/problems/${id}`);
  return <ProblemDetailScreen problemId={id} shareToken={publicShare ? requestedShareToken : undefined} />;
}
