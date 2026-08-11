import type { Metadata } from "next";
import { ProblemEditor } from "../../../components/ProblemEditor";

export const metadata: Metadata = {
  title: "问题设置",
};

export default function ProblemSettingsPage() {
  return <ProblemEditor mode="settings" />;
}
