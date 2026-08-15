import type { Metadata } from "next";
import { PlaygroundEditor } from "../../components/PlaygroundEditor";
import { requirePageMember } from "../../lib/page-auth";

export const metadata: Metadata = { title: "发布内容" };
export default async function NewPlaygroundPage() {
  await requirePageMember("/playground/new");
  return <PlaygroundEditor mode="publish" />;
}
