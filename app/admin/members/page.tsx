import type { Metadata } from "next";
import { AdminScreen } from "../../components/AdminScreens";

export const metadata: Metadata = { title: "人员管理" };
export default function AdminMembersPage() { return <AdminScreen section="members" />; }

