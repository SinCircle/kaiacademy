import type { Metadata } from "next";
import { AdminScreen } from "../../components/AdminScreens";

export const metadata: Metadata = { title: "游乐场管理" };
export default function AdminPlaygroundPage() { return <AdminScreen section="playground" />; }
