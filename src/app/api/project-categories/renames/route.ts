import { NextResponse } from "next/server";
import { normalizeRenames } from "../../../../lib/data-transfer";
import { getAllRenames } from "../../../../lib/kv";

export async function GET() {
  try {
    const renames = normalizeRenames(await getAllRenames());
    return NextResponse.json({ renames });
  } catch {
    return NextResponse.json({ error: "Failed to fetch renames" }, { status: 503 });
  }
}
