import type { Metadata } from "next";
import { ProblemsScreen } from "../components/SearchScreen";

export const metadata: Metadata = {
  title: "难题",
};

export default function ProblemsPage() {
  return <ProblemsScreen />;
}
