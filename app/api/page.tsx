import type { Metadata } from "next";
import { ApiScreen } from "../components/ApiScreen";
import { requirePageMember } from "../lib/page-auth";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "API" };
export const dynamic = "force-dynamic";
export default async function ApiPage() {
  const member = await requirePageMember("/api");
  if (!member.apiEnabled || !member.apiQualified) redirect("/profile");
  return <ApiScreen />;
}
