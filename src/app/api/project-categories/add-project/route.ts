import { NextRequest, NextResponse } from "next/server";
import { validatePage, validateProjectName } from "../../../../lib/data-transfer";
import { addProjectToKV, ProjectConflictError } from "../../../../lib/kv";

export async function POST(request: NextRequest) {
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
    await addProjectToKV(String(page), project);
    return NextResponse.json({ success: true, project }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to add project" }, { status: 503 });
  }
}
