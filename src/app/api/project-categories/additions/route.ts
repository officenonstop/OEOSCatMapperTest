import { NextResponse } from "next/server";
import { getAddedProjects } from "../../../../lib/kv";

export async function GET() {
  try {
    const additions = await getAddedProjects();
    return NextResponse.json({ additions });
  } catch {
    return NextResponse.json({ error: "Failed to fetch additions" }, { status: 503 });
  }
}
