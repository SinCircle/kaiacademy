import type { Metadata } from "next";
import { PlaygroundScreen } from "../components/PlaygroundScreen";
import { requirePageMember } from "../lib/page-auth";

export const metadata: Metadata = { title: "游乐场" };
export default async function PlaygroundPage() {
  await requirePageMember("/playground");
  return <PlaygroundScreen />;
}
