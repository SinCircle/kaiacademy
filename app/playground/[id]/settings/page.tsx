import type { Metadata } from "next";
import { PlaygroundEditor } from "../../../components/PlaygroundEditor";
import { requirePageMember } from "../../../lib/page-auth";

export const metadata: Metadata = { title: "内容设置" };
export default async function PlaygroundSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePageMember(`/playground/${id}/settings`);
  return <PlaygroundEditor mode="settings" postId={id} />;
}
