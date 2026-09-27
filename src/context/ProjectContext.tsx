"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PAGE_NUMBERS, PAGE_PROJECTS } from "../lib/constants";
import { resolveEffectiveName, validateProjectName } from "../lib/data-transfer";
import type { ViewMode } from "../lib/groups";
import type { ProjectAdditions, ProjectRenames } from "../lib/types";

const VIEW_MODE_STORAGE_KEY = "catmapper.viewMode";

function isViewMode(value: unknown): value is ViewMode {
  return value === "sorted" || value === "grouped";
}

interface ProjectContextValue {
  currentPage: number;
  currentProject: string;
  selectedCategories: string[];
  pageProjects: Record<string, Record<string, string[]>>;
  pageIndex: number;
  totalPages: number;
  projectRenames: ProjectRenames;
  addedProjects: ProjectAdditions;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  setCurrentPage: (page: number) => void;
  setCurrentProject: (project: string) => void;
  toggleCategory: (category: string) => void;
  goToPrevPage: () => void;
  goToNextPage: () => void;
  renameProject: (oldName: string, newName: string) => Promise<void>;
  addProject: (name: string) => Promise<void>;
  deleteProject: (name: string) => Promise<void>;
  importCategories: (data: unknown) => Promise<void>;
  getEffectiveName: (project: string) => string;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

async function responseError(response: Response, fallback: string): Promise<Error> {
  try {
    const body = await response.json();
    return new Error(typeof body.error === "string" ? body.error : fallback);
  } catch {
    return new Error(fallback);
  }
}

export function ProjectProvider({ children }: { children: ReactNode }) {
  const firstPage = PAGE_NUMBERS[0];
  const initialProject = PAGE_PROJECTS[firstPage]?.[0] ?? "";
  const [projectRenames, setProjectRenames] = useState<ProjectRenames>({});
  const [addedProjects, setAddedProjects] = useState<ProjectAdditions>({});
  const [currentPage, setCurrentPageState] = useState(firstPage);
  const [currentProject, setCurrentProjectState] = useState(initialProject);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [pageProjects, setPageProjects] = useState<Record<string, Record<string, string[]>>>({});
  // Default "sorted" keeps first paint identical to pre-toggle behavior (and SSR-safe).
  // A stored "grouped" preference is rehydrated after mount, so returning users see a
  // one-time relayout — accepted trade-off, documented in grouped-categories.md (C1).
  const [viewMode, setViewModeState] = useState<ViewMode>("sorted");

  const renamesRef = useRef(projectRenames);
  const additionsRef = useRef(addedProjects);
  const currentPageRef = useRef(currentPage);
  const currentProjectRef = useRef(currentProject);
  const selectedCategoriesRef = useRef(selectedCategories);
  const loadSequence = useRef(0);
  const saveQueuesRef = useRef<Record<string, Promise<void>>>({});
  const saveVersionsRef = useRef<Record<string, number>>({});
  renamesRef.current = projectRenames;
  additionsRef.current = addedProjects;
  currentPageRef.current = currentPage;
  currentProjectRef.current = currentProject;
  selectedCategoriesRef.current = selectedCategories;

  const pageIndex = PAGE_NUMBERS.indexOf(currentPage);
  const totalPages = PAGE_NUMBERS.length;

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      // Only the two known literals are accepted; anything else falls back to "sorted"
      // so a corrupt value can never blank the grid.
      if (isViewMode(stored)) setViewModeState(stored);
    } catch {
      // localStorage unavailable (private mode, quota) — session-only default.
    }
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // Persisting is best-effort; the toggle still works for the session.
    }
  }, []);

  const selectProject = useCallback((project: string, categories: string[] = []) => {
    currentProjectRef.current = project;
    selectedCategoriesRef.current = categories;
    setCurrentProjectState(project);
    setSelectedCategories(categories);
  }, []);

  const fetchRenames = useCallback(async (): Promise<ProjectRenames> => {
    const response = await fetch("/api/project-categories/renames");
    if (!response.ok) throw await responseError(response, "Failed to load project renames");
    const data = await response.json();
    return data.renames ?? {};
  }, []);

  const fetchAdditions = useCallback(async (): Promise<ProjectAdditions> => {
    const response = await fetch("/api/project-categories/additions");
    if (!response.ok) throw await responseError(response, "Failed to load added projects");
    const data = await response.json();
    return data.additions ?? {};
  }, []);

  const loadPageData = useCallback(async (page: number, project: string) => {
    const requestId = ++loadSequence.current;
    if (!project) {
      if (requestId === loadSequence.current) {
        selectedCategoriesRef.current = [];
        setSelectedCategories([]);
      }
      return;
    }

    try {
      const response = await fetch(`/api/project-categories?page=${page}`);
      if (!response.ok) throw await responseError(response, "Failed to load categories");
      const data = await response.json();
      if (requestId !== loadSequence.current) return;
      const projects: Record<string, string[]> = data.projects ?? {};
      const categories = projects[project] ?? [];
      setPageProjects((previous) => ({ ...previous, [String(page)]: projects }));
      selectedCategoriesRef.current = categories;
      setSelectedCategories(categories);
    } catch {
      if (requestId === loadSequence.current) {
        selectedCategoriesRef.current = [];
        setSelectedCategories([]);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRenames(), fetchAdditions()])
      .then(([renames, additions]) => {
        if (cancelled) return;
        renamesRef.current = renames;
        additionsRef.current = additions;
        setProjectRenames(renames);
        setAddedProjects(additions);
        const effective = resolveEffectiveName(renames[String(firstPage)], initialProject);
        if (currentPageRef.current === firstPage && currentProjectRef.current === initialProject) {
          selectProject(effective);
          void loadPageData(firstPage, effective);
        }
      })
      .catch(() => {
        // The page remains usable with its local empty state.
      });
    return () => {
      cancelled = true;
    };
  }, [fetchAdditions, fetchRenames, firstPage, initialProject, loadPageData, selectProject]);

  useEffect(() => {
    void loadPageData(currentPage, currentProjectRef.current);
  }, [currentPage, loadPageData]);

  const getEffectiveName = useCallback((project: string): string => {
    return resolveEffectiveName(renamesRef.current[String(currentPageRef.current)], project);
  }, []);

  const projectsForPage = useCallback((page: number): string[] => {
    const pageKey = String(page);
    const canonical = (PAGE_PROJECTS[page] ?? []).map((project) =>
      resolveEffectiveName(renamesRef.current[pageKey], project)
    );
    return [...canonical, ...(additionsRef.current[pageKey] ?? [])];
  }, []);

  const setCurrentPage = useCallback((page: number) => {
    if (!PAGE_NUMBERS.includes(page)) return;
    currentPageRef.current = page;
    setCurrentPageState(page);
    const nextProject = projectsForPage(page)[0] ?? "";
    selectProject(nextProject);
  }, [projectsForPage, selectProject]);

  const setCurrentProject = useCallback((project: string) => {
    const categories = pageProjects[String(currentPageRef.current)]?.[project] ?? [];
    selectProject(project, categories);
  }, [pageProjects, selectProject]);

  const toggleCategory = useCallback(async (category: string) => {
    const page = currentPageRef.current;
    const project = currentProjectRef.current;
    if (!project) return;
    const previousCategories = selectedCategoriesRef.current;
    const nextCategories = previousCategories.includes(category)
      ? previousCategories.filter((item) => item !== category)
      : [...previousCategories, category];
    const saveKey = `${page}\u0000${project}`;
    const saveVersion = (saveVersionsRef.current[saveKey] ?? 0) + 1;
    saveVersionsRef.current[saveKey] = saveVersion;

    selectedCategoriesRef.current = nextCategories;
    setSelectedCategories(nextCategories);
    setPageProjects((previous) => ({
      ...previous,
      [String(page)]: {
        ...(previous[String(page)] ?? {}),
        [project]: nextCategories,
      },
    }));

    const save = async () => {
      const response = await fetch("/api/project-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, project, categories: nextCategories }),
      });
      if (!response.ok) throw await responseError(response, "Failed to save categories");
    };

    saveQueuesRef.current[saveKey] = (saveQueuesRef.current[saveKey] ?? Promise.resolve())
      .catch(() => {
        // A previous failed save for this project has already shown its own error.
      })
      .then(save)
      .catch((error) => {
        if (saveVersionsRef.current[saveKey] !== saveVersion) return;
        setPageProjects((previous) => ({
          ...previous,
          [String(page)]: {
            ...(previous[String(page)] ?? {}),
            [project]: previousCategories,
          },
        }));
        if (currentPageRef.current === page && currentProjectRef.current === project) {
          selectedCategoriesRef.current = previousCategories;
          setSelectedCategories(previousCategories);
        }
        alert(error instanceof Error ? error.message : "Failed to save categories");
      });
  }, []);

  const renameProject = useCallback(async (oldName: string, requestedName: string) => {
    let newName: string;
    try {
      newName = validateProjectName(requestedName);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Invalid project name");
      return;
    }
    if (newName === oldName) return;

    const page = currentPageRef.current;
    const pageKey = String(page);
    const names = projectsForPage(page);
    const duplicate = names.some((name) =>
      name.toLocaleLowerCase() === newName.toLocaleLowerCase()
      && name.toLocaleLowerCase() !== oldName.toLocaleLowerCase()
    );
    if (duplicate) {
      alert("A project with that name already exists on this page");
      return;
    }

    const previousRenames = renamesRef.current[pageKey];
    const previousAdditions = additionsRef.current[pageKey];
    const previousPageProjects = pageProjects[pageKey] ?? {};
    const oldCategories = previousPageProjects[oldName] ?? selectedCategories;
    const addedName = (previousAdditions ?? []).find(
      (name) => name.toLocaleLowerCase() === oldName.toLocaleLowerCase()
    );

    if (addedName) {
      setAddedProjects((previous) => {
        const next = {
          ...previous,
          [pageKey]: (previous[pageKey] ?? []).map((name) => name === addedName ? newName : name),
        };
        additionsRef.current = next;
        return next;
      });
    } else {
      const original = (PAGE_PROJECTS[page] ?? []).find(
        (name) => resolveEffectiveName(renamesRef.current[pageKey], name) === oldName
      );
      if (!original) {
        alert("Project not found");
        return;
      }
      setProjectRenames((previous) => {
        const pageRenames = { ...(previous[pageKey] ?? {}) };
        if (newName === original) delete pageRenames[original];
        else pageRenames[original] = newName;
        const next = { ...previous, [pageKey]: pageRenames };
        if (Object.keys(pageRenames).length === 0) delete next[pageKey];
        renamesRef.current = next;
        return next;
      });
    }

    setPageProjects((previous) => {
      const projects = { ...(previous[pageKey] ?? {}) };
      projects[newName] = projects[oldName] ?? oldCategories;
      delete projects[oldName];
      return { ...previous, [pageKey]: projects };
    });
    selectProject(newName, oldCategories);

    try {
      const response = await fetch("/api/project-categories/rename", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, oldName, newName }),
      });
      if (!response.ok) throw await responseError(response, "Failed to rename project");
    } catch (error) {
      setProjectRenames((previous) => {
        const next = { ...previous };
        if (previousRenames) next[pageKey] = previousRenames;
        else delete next[pageKey];
        renamesRef.current = next;
        return next;
      });
      setAddedProjects((previous) => {
        const next = { ...previous };
        if (previousAdditions) next[pageKey] = previousAdditions;
        else delete next[pageKey];
        additionsRef.current = next;
        return next;
      });
      setPageProjects((previous) => ({ ...previous, [pageKey]: previousPageProjects }));
      if (currentPageRef.current === page && currentProjectRef.current === newName) {
        selectProject(oldName, oldCategories);
      }
      alert(error instanceof Error ? error.message : "Failed to rename project");
    }
  }, [pageProjects, projectsForPage, selectProject, selectedCategories]);

  const addProject = useCallback(async (requestedName: string) => {
    let name: string;
    try {
      name = validateProjectName(requestedName);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Invalid project name");
      return;
    }

    const page = currentPageRef.current;
    const pageKey = String(page);
    if (projectsForPage(page).some((project) =>
      project.toLocaleLowerCase() === name.toLocaleLowerCase()
    )) {
      alert("A project with that name already exists on this page");
      return;
    }

    const previousProject = currentProjectRef.current;
    const previousCategories = selectedCategories;
    setAddedProjects((previous) => {
      const next = { ...previous, [pageKey]: [...(previous[pageKey] ?? []), name] };
      additionsRef.current = next;
      return next;
    });
    setPageProjects((previous) => ({
      ...previous,
      [pageKey]: { ...(previous[pageKey] ?? {}), [name]: [] },
    }));
    selectProject(name, []);

    try {
      const response = await fetch("/api/project-categories/add-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, project: name }),
      });
      if (!response.ok) throw await responseError(response, "Failed to add project");
    } catch (error) {
      setAddedProjects((previous) => {
        const next = {
          ...previous,
          [pageKey]: (previous[pageKey] ?? []).filter((project) => project !== name),
        };
        if (next[pageKey].length === 0) delete next[pageKey];
        additionsRef.current = next;
        return next;
      });
      setPageProjects((previous) => {
        const projects = { ...(previous[pageKey] ?? {}) };
        delete projects[name];
        return { ...previous, [pageKey]: projects };
      });
      if (currentPageRef.current === page && currentProjectRef.current === name) {
        selectProject(previousProject, previousCategories);
      }
      alert(error instanceof Error ? error.message : "Failed to add project");
    }
  }, [projectsForPage, selectProject, selectedCategories]);

  const deleteProject = useCallback(async (requestedName: string) => {
    if (!requestedName) return;
    if (!confirm(`Delete project '${requestedName}' and all its categories?`)) return;

    const page = currentPageRef.current;
    const pageKey = String(page);
    const previousAdditions = additionsRef.current[pageKey];
    const previousPageProjects = pageProjects[pageKey] ?? {};
    const previousCategories = selectedCategories;
    const addedName = (previousAdditions ?? []).find(
      (name) => name.toLocaleLowerCase() === requestedName.toLocaleLowerCase()
    );
    const isAdded = Boolean(addedName);

    if (addedName) {
      setAddedProjects((previous) => {
        const next = {
          ...previous,
          [pageKey]: (previous[pageKey] ?? []).filter((name) => name !== addedName),
        };
        if (next[pageKey].length === 0) delete next[pageKey];
        additionsRef.current = next;
        return next;
      });
    }

    setPageProjects((previous) => {
      const projects = { ...(previous[pageKey] ?? {}) };
      if (isAdded) delete projects[requestedName];
      else projects[requestedName] = [];
      return { ...previous, [pageKey]: projects };
    });

    const canonical = (PAGE_PROJECTS[page] ?? []).map((project) =>
      resolveEffectiveName(renamesRef.current[pageKey], project)
    );
    const remaining = [
      ...canonical.filter((project) => project !== requestedName),
      ...(previousAdditions ?? []).filter((project) => project !== addedName),
    ];
    const nextProject = remaining[0] ?? (isAdded ? "" : requestedName);
    const nextCategories = nextProject === requestedName
      ? []
      : previousPageProjects[nextProject] ?? [];
    selectProject(nextProject, nextCategories);

    try {
      const response = await fetch("/api/project-categories/delete-project", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ page, project: requestedName }),
      });
      if (!response.ok) throw await responseError(response, "Failed to delete project");
      await loadPageData(page, nextProject);
    } catch (error) {
      setAddedProjects((previous) => {
        const next = { ...previous };
        if (previousAdditions) next[pageKey] = previousAdditions;
        else delete next[pageKey];
        additionsRef.current = next;
        return next;
      });
      setPageProjects((previous) => ({ ...previous, [pageKey]: previousPageProjects }));
      if (currentPageRef.current === page && currentProjectRef.current === nextProject) {
        selectProject(requestedName, previousCategories);
      }
      alert(error instanceof Error ? error.message : "Failed to delete project");
    }
  }, [loadPageData, pageProjects, selectProject, selectedCategories]);

  const importCategories = useCallback(async (data: unknown) => {
    const page = currentPageRef.current;
    const pageKey = String(page);
    const selectedBeforeImport = currentProjectRef.current;
    const oldRenames = renamesRef.current;
    try {
      const response = await fetch("/api/project-categories/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw await responseError(response, "Failed to import data");
      const result = await response.json();
      const [renames, additions] = await Promise.all([fetchRenames(), fetchAdditions()]);
      renamesRef.current = renames;
      additionsRef.current = additions;
      setProjectRenames(renames);
      setAddedProjects(additions);

      const selectedOriginal = (PAGE_PROJECTS[page] ?? []).find(
        (original) => resolveEffectiveName(oldRenames[pageKey], original) === selectedBeforeImport
      );
      const available = [
        ...(PAGE_PROJECTS[page] ?? []).map((original) =>
          resolveEffectiveName(renames[pageKey], original)
        ),
        ...(additions[pageKey] ?? []),
      ];
      const preferred = selectedOriginal
        ? resolveEffectiveName(renames[pageKey], selectedOriginal)
        : available.find((name) => name === selectedBeforeImport) ?? available[0] ?? "";
      if (currentPageRef.current === page) {
        selectProject(preferred);
        await loadPageData(page, preferred);
      }
      alert(
        `Import complete: ${result.stats.pagesRestored} pages, `
        + `${result.stats.projectsRestored} projects imported, `
        + `${result.stats.additionsCreated} new projects added, `
        + `${result.stats.pagesCleared} previous pages cleared.`
      );
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to import data");
    }
  }, [fetchAdditions, fetchRenames, loadPageData, selectProject]);

  const goToPrevPage = useCallback(() => {
    const index = PAGE_NUMBERS.indexOf(currentPageRef.current);
    if (index > 0) setCurrentPage(PAGE_NUMBERS[index - 1]);
  }, [setCurrentPage]);

  const goToNextPage = useCallback(() => {
    const index = PAGE_NUMBERS.indexOf(currentPageRef.current);
    if (index < PAGE_NUMBERS.length - 1) setCurrentPage(PAGE_NUMBERS[index + 1]);
  }, [setCurrentPage]);

  return (
    <ProjectContext.Provider
      value={{
        currentPage,
        currentProject,
        selectedCategories,
        pageProjects,
        pageIndex,
        totalPages,
        projectRenames,
        addedProjects,
        viewMode,
        setViewMode,
        setCurrentPage,
        setCurrentProject,
        toggleCategory,
        goToPrevPage,
        goToNextPage,
        renameProject,
        addProject,
        deleteProject,
        importCategories,
        getEffectiveName,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error("useProject must be used within ProjectProvider");
  return context;
}
