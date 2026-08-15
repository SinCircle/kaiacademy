import type { Metadata } from "next";
import { AdminScreen } from "../../components/AdminScreens";

export const metadata: Metadata = { title: "API 管理" };
export default function AdminApiPage() { return <AdminScreen section="api" />; }
