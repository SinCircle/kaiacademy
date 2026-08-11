import type { Metadata } from "next";
import { ProfileScreen } from "../../components/ProfileScreen";

export const metadata: Metadata = { title: "成员主页" };
export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProfileScreen memberId={id} />;
}
