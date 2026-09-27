import { NextRequest, NextResponse } from "next/server";
import { validateCategorySelection, validatePage, validateProjectName } from "../../../lib/data-transfer";
import {
  deleteAllData,
  getPageData,
  getProjectCategories,
  ProjectNotFoundError,
  setProjectCategories,
} from "../../../lib/kv";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page");
  const project = searchParams.get("project");

  let pageNumber: number;
  try {
    pageNumber = validatePage(page);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid page" },
      { status: 400 }
    );
  }

  try {
    if (project) {
      const categories = await getProjectCategories(String(pageNumber), project);
      return NextResponse.json({ categories });
    }

    const projects = await getPageData(pageNumber);
    return NextResponse.json({ projects });
  } catch {
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 503 });
  }
}

export async function PUT(request: NextRequest) {
  let page: number;
  let project: string;
  let categories: string[];
  try {
    const body = await request.json();
    page = validatePage(body?.page);
    project = validateProjectName(body?.project);
    categories = validateCategorySelection(body?.categories);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid request" },
      { status: 400 }
    );
  }

  try {
    await setProjectCategories(String(page), project, categories);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof ProjectNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json({ error: "Failed to save categories" }, { status: 503 });
  }
}

export async function DELETE() {
  try {
    await deleteAllData();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete data" }, { status: 503 });
  }
}
