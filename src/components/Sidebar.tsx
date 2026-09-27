"use client";

import { useRef, type ChangeEvent } from "react";
import ProjectList from "./ProjectList";
import { useProject } from "../context/ProjectContext";
import { MAX_IMPORT_BYTES, parseImportPayload } from "../lib/data-transfer";

export default function Sidebar() {
  const { importCategories, addProject, deleteProject, currentProject } = useProject();
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    try {
      const res = await fetch("/api/project-categories/export");
      if (!res.ok) throw new Error("Failed to export data");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "catmapper-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to export data");
    }
  };

  const handleDeleteAll = async () => {
    if (!confirm("Delete ALL data? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/project-categories", { method: "DELETE" });
      if (res.ok) {
        alert("All data deleted.");
        window.location.reload();
      }
    } catch {
      alert("Failed to delete data");
    }
  };

  const handleImportClick = () => {
    if (!confirm("Importing will replace all saved category selections, renames, and added projects. Page numbers and page images are not affected. Continue?")) return;
    importInputRef.current?.click();
  };

  const handleImportChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("Import file is too large");
      const text = await file.text();
      const data = JSON.parse(text);
      parseImportPayload(data);
      await importCategories(data);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to import data: invalid file");
    } finally {
      if (e.target) e.target.value = "";
    }
  };

  const handleAddProject = async () => {
    const name = prompt("Enter new project name:");
    if (name === null) return;
    await addProject(name);
  };

  const handleDeleteProject = async () => {
    await deleteProject(currentProject);
  };

  return (
    <aside className="w-[280px] h-screen flex-shrink-0 border-r border-gray-300 bg-gray-50 flex flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <ProjectList />
      </div>
      <div className="p-4 border-t border-gray-300 flex flex-col gap-2">
        <button
          onClick={handleExport}
          className="w-full px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors"
        >
          Export Data
        </button>
        <button
          onClick={handleImportClick}
          className="w-full px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 transition-colors"
        >
          Import Data
        </button>
        <button
          onClick={handleAddProject}
          className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors"
        >
          Add Project
        </button>
        <button
          onClick={handleDeleteProject}
          disabled={!currentProject}
          className="w-full px-3 py-2 bg-orange-700 text-white text-sm font-medium rounded hover:bg-orange-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Delete Project
        </button>
        <button
          onClick={handleDeleteAll}
          className="w-full px-3 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors"
        >
          Delete All Data
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportChange}
        />
      </div>
    </aside>
  );
}
