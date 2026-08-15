import type { Metadata } from "next";
import { ForgotPasswordScreen } from "../components/AuthScreens";

export const metadata: Metadata = { title: "重置密码" };
export default function ForgotPasswordPage() { return <ForgotPasswordScreen />; }
