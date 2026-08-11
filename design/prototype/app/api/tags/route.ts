import { listTags } from "../../../db/problems";

export async function GET() {
  try {
    return Response.json({ tags: await listTags() });
  } catch (error) {
    console.error("Failed to list tags", error);
    return Response.json({ tags: [] });
  }
}
