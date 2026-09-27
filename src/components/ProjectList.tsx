"use client";

import { PAGE_PROJECTS } from "../lib/constants";
import { useProject } from "../context/ProjectContext";

export default function ProjectList() {
  const { currentPage, currentProject, setCurrentProject, pageProjects, getEffectiveName, addedProjects } = useProject();
  const originalProjects = PAGE_PROJECTS[currentPage] ?? [];
  const extraProjects = addedProjects[String(currentPage)] ?? [];
  const allProjects = [...originalProjects, ...extraProjects];
  const projectCats = pageProjects[String(currentPage)] ?? {};

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2">Page {currentPage} — Projects</p>
      <div className="space-y-1">
        {allProjects.map((project) => {
          const isAdded = extraProjects.includes(project);
          const effectiveName = isAdded ? project : getEffectiveName(project);
          const cats = projectCats[project] ?? projectCats[effectiveName] ?? [];
          const hasNoCategories = cats.length === 0;
          const isActive = (currentProject === project || currentProject === effectiveName);

          return (
            <button
              key={`${isAdded ? "added" : "canonical"}-${project}`}
              onClick={() => setCurrentProject(effectiveName)}
              aria-pressed={isActive}
              className={`w-full text-left px-2 py-1.5 rounded text-sm transition-colors ${
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-gray-700 hover:bg-gray-200"
              }`}
            >
              {effectiveName}
              {hasNoCategories && <span className="ml-1 opacity-70">*</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
