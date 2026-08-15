import type { Metadata } from "next";
import { PlaygroundDetailScreen } from "../../components/PlaygroundDetailScreen";
import { requirePageMember } from "../../lib/page-auth";

export const metadata: Metadata = { title: "游乐场内容" };
export default async function PlaygroundPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageMember(`/playground/${id}`);
  return <PlaygroundDetailScreen postId={id} />;
}
