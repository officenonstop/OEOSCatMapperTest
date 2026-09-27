import { NextRequest, NextResponse } from "next/server";
import { validatePage, validateProjectName } from "../../../../lib/data-transfer";
import { deleteProjectFromKV, ProjectNotFoundError } from "../../../../lib/kv";

export async function DELETE(request: NextRequest) {
  let page: number;
  let project: string;
  try {
    const body = await request.json();
    page = validatePage(body?.page);
    project = validateProjectName(body?.project);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 }
    );
  }

  try {
    const action = await deleteProjectFromKV(String(page), project);
    return NextResponse.json({ success: true, action });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to delete project" }, { status: 503 });
  }
}
