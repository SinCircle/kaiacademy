import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentMember } from "../../db/auth";

export async function requirePageMember(returnTo: string) {
  const requestHeaders = await headers();
  const request = new Request("http://localhost/", {
    headers: { cookie: requestHeaders.get("cookie") ?? "" },
  });
  const member = await currentMember(request);
  if (!member) redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  return member;
}
