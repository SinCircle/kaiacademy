import type { Metadata } from "next";
import { RegisterScreen } from "../components/AuthScreens";

export const metadata: Metadata = { title: "注册" };
export default function RegisterPage() { return <RegisterScreen />; }
