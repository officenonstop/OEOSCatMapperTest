import { NextRequest, NextResponse } from "next/server";
import { validatePage, validateProjectName } from "../../../../lib/data-transfer";
import {
  ProjectConflictError,
  ProjectNotFoundError,
  renameProjectInKV,
} from "../../../../lib/kv";

export async function PUT(request: NextRequest) {
  let page: number;
  let oldName: string;
  let newName: string;
  try {
    const body = await request.json();
    page = validatePage(body?.page);
    oldName = validateProjectName(body?.oldName);
    newName = validateProjectName(body?.newName);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const kind = await renameProjectInKV(String(page), oldName, newName);
    return NextResponse.json({ success: true, project: newName, kind });
  } catch (error) {
    if (error instanceof ProjectConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to rename project" }, { status: 503 });
  }
}
