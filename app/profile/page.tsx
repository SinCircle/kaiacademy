import type { Metadata } from "next";
import { ProfileScreen } from "../components/ProfileScreen";

export const metadata: Metadata = { title: "个人主页" };
export default function ProfilePage() { return <ProfileScreen />; }
