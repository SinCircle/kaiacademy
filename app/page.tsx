import type { Metadata } from "next";
import { HomeScreen } from "./components/HomeScreen";

export const metadata: Metadata = { title: "首页" };
export default function HomePage() { return <HomeScreen />; }
