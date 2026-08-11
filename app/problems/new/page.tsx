import type { Metadata } from "next";
import { ProblemEditor } from "../../components/ProblemEditor";

export const metadata: Metadata = { title: "发布问题" };
export default function NewProblemPage() { return <ProblemEditor mode="publish" />; }
