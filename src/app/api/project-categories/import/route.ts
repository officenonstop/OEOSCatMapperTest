import { NextRequest, NextResponse } from "next/server";
import { MAX_IMPORT_BYTES, parseImportPayload } from "../../../../lib/data-transfer";
import { importData, ProjectConflictError } from "../../../../lib/kv";

export async function POST(request: NextRequest) {
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: "Import file is too large" }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Import file is not valid JSON" }, { status: 400 });
  }

  let data;
  try {
    data = parseImportPayload(parsed);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid import data" },
      { status: 422 }
    );
  }

  try {
    const stats = await importData(data);
    return NextResponse.json({ success: true, format: data.format, stats });
  } catch (error) {
    if (error instanceof ProjectConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to import data" }, { status: 503 });
  }
}
