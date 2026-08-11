import type { Metadata } from "next";
import { AdminScreen } from "../../components/AdminScreens";

export const metadata: Metadata = { title: "问题管理" };
export default function AdminProblemsPage() { return <AdminScreen section="problems" />; }

