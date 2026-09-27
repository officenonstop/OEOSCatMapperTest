import { NextResponse } from "next/server";
import { PAGE_PROJECTS } from "../../../../lib/constants";
import {
  createExportBundle,
  normalizeRenames,
  resolveEffectiveName,
} from "../../../../lib/data-transfer";
import { getAddedProjects, getAllData, getAllRenames } from "../../../../lib/kv";
import type { CategoryData, ProjectAdditions } from "../../../../lib/types";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const compact = searchParams.get("compact") === "true";
    const [savedData, storedRenames, storedAdditions] = await Promise.all([
      getAllData(),
      getAllRenames(),
      getAddedProjects(),
    ]);
    const renames = normalizeRenames(storedRenames);
    const additions: ProjectAdditions = Object.fromEntries(
      Object.entries(storedAdditions).map(([page, projects]) => [page, [...projects]])
    );
    const categories: CategoryData = {};
    const coveredNames: Record<string, Set<string>> = {};

    for (const [page, projects] of Object.entries(PAGE_PROJECTS)) {
      categories[page] = {};
      coveredNames[page] = new Set<string>();
      for (const original of projects) {
        const effective = resolveEffectiveName(renames[page], original);
        coveredNames[page].add(effective);
        const projectCategories = savedData[page]?.[effective] ?? [];
        if (!compact || projectCategories.length > 0) {
          categories[page][effective] = projectCategories;
        }
      }
    }

    for (const [page, addedProjects] of Object.entries(additions)) {
      if (!categories[page]) categories[page] = {};
      if (!coveredNames[page]) coveredNames[page] = new Set<string>();
      for (const project of addedProjects) {
        coveredNames[page].add(project);
        const projectCategories = savedData[page]?.[project] ?? [];
        if (!compact || projectCategories.length > 0) {
          categories[page][project] = projectCategories;
        }
      }
    }

    // Preserve legacy/orphaned saved keys by treating them as additions in V4.
    for (const [page, projects] of Object.entries(savedData)) {
      if (!categories[page]) categories[page] = {};
      if (!coveredNames[page]) coveredNames[page] = new Set<string>();
      for (const [project, projectCategories] of Object.entries(projects)) {
        if (coveredNames[page].has(project)) continue;
        additions[page] = [...(additions[page] ?? []), project];
        coveredNames[page].add(project);
        if (!compact || projectCategories.length > 0) {
          categories[page][project] = projectCategories;
        }
      }
    }

    if (compact) {
      for (const page of Object.keys(categories)) {
        if (Object.keys(categories[page]).length === 0) delete categories[page];
      }
    }

    const json = JSON.stringify(createExportBundle(categories, renames, additions), null, 2);
    return new NextResponse(json, {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="catmapper-data.json"',
      },
    });
  } catch {
    return NextResponse.json({ error: "Failed to export data" }, { status: 503 });
  }
}
