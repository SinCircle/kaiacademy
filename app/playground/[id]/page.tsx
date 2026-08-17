import type { Metadata } from "next";
import { PlaygroundDetailScreen } from "../../components/PlaygroundDetailScreen";
import { isValidPlaygroundShareToken } from "../../../db/playground-share";
import { requirePageMember } from "../../lib/page-auth";

export const metadata: Metadata = { title: "游乐场内容" };
export default async function PlaygroundPostPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ share?: string }>;
}) {
  const { id } = await params;
  const requestedShareToken = (await searchParams).share?.trim() ?? "";
  const publicShare = await isValidPlaygroundShareToken(id, requestedShareToken);
  if (!publicShare) await requirePageMember(`/playground/${id}`);
  return <PlaygroundDetailScreen postId={id} shareToken={publicShare ? requestedShareToken : undefined} />;
}
