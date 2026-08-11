import type { Metadata } from "next";
import { LoginScreen } from "../components/AuthScreens";

export const metadata: Metadata = { title: "登录" };
export default function LoginPage() { return <LoginScreen />; }
