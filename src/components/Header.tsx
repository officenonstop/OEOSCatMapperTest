"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useProject } from "../context/ProjectContext";
import { PAGE_NUMBERS } from "../lib/constants";

interface Props {
  setShowImage: (visible: boolean) => void;
}

export default function Header({ setShowImage }: Props) {
  const { currentPage, currentProject, selectedCategories, setCurrentPage, goToPrevPage, goToNextPage, renameProject, viewMode, setViewMode } = useProject();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [jumpValue, setJumpValue] = useState("");
  const [jumpError, setJumpError] = useState<string | null>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handlePointerDown = useCallback(() => setShowImage(true), [setShowImage]);
  const handlePointerUp = useCallback(() => setShowImage(false), [setShowImage]);

  const startEditing = useCallback(() => {
    setEditValue(currentProject);
    setEditing(true);
  }, [currentProject]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    if (editValue.trim() && editValue.trim() !== currentProject) {
      renameProject(currentProject, editValue.trim());
    }
  }, [editValue, currentProject, renameProject]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commitEdit();
      if (e.key === "Escape") setEditing(false);
    },
    [commitEdit]
  );

  const handleJump = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const trimmed = String(new FormData(e.currentTarget).get("jump") ?? "").trim();
      if (!trimmed) return;
      if (!/^\d+$/.test(trimmed)) {
        setJumpError("Enter a valid page number");
        return;
      }
      const num = parseInt(trimmed, 10);
      if (!PAGE_NUMBERS.includes(num)) {
        setJumpError(`Page ${num} not found`);
        return;
      }
      setCurrentPage(num);
      setJumpValue("");
      setJumpError(null);
    },
    [setCurrentPage]
  );

  const hasNoCategories = selectedCategories.length === 0;

  return (
    <header className="h-14 flex-shrink-0 flex items-center justify-between px-2 sm:px-4 border-b border-gray-300 bg-white relative z-20">
        <button
          onClick={goToPrevPage}
          className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300 transition-colors"
        >
          &lt; Prev Page
        </button>

        <div className="flex items-center gap-1 min-w-0 px-1 sm:px-4">
          <span className="text-sm font-medium text-gray-800 whitespace-nowrap">
            Page {currentPage}:
          </span>
          {editing ? (
            <input
              ref={inputRef}
              aria-label="Project name"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleKeyDown}
              className="text-sm font-medium px-1 py-0.5 border border-blue-400 rounded outline-none min-w-[120px]"
            />
          ) : (
            <span className="text-sm font-medium text-gray-800 truncate max-w-[400px]">
              {currentProject}
              {hasNoCategories && <span className="ml-1 text-blue-500">*</span>}
            </span>
          )}
          <button
            onClick={startEditing}
            className="flex-shrink-0 p-1 rounded hover:bg-gray-200 transition-colors"
            title="Edit project name"
          >
            <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToNextPage}
            className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300 transition-colors"
          >
            Next Page &gt;
          </button>
          <div
            role="group"
            aria-label="Category view"
            className="flex items-center rounded border border-gray-300 overflow-hidden"
          >
            <button
              onClick={() => setViewMode("sorted")}
              aria-pressed={viewMode === "sorted"}
              className={`px-2 py-1.5 text-xs transition-colors ${
                viewMode === "sorted"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              Sorted
            </button>
            <button
              onClick={() => setViewMode("grouped")}
              aria-pressed={viewMode === "grouped"}
              className={`px-2 py-1.5 text-xs transition-colors border-l border-gray-300 ${
                viewMode === "grouped"
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-100"
              }`}
            >
              Grouped
            </button>
          </div>
          <form onSubmit={handleJump} className="relative flex items-center">
            <input
              type="text"
              inputMode="numeric"
              name="jump"
              aria-label="Jump to page"
              placeholder="Go to page"
              value={jumpValue}
              onChange={(e) => {
                setJumpValue(e.target.value);
                if (jumpError) setJumpError(null);
              }}
              className="w-24 flex-shrink-0 text-sm px-2 py-1.5 border border-gray-300 rounded outline-none focus:border-blue-400"
            />
            {jumpError && (
              <span className="absolute top-full left-0 mt-1 text-xs text-red-600 whitespace-nowrap bg-white px-1 rounded shadow-sm">
                {jumpError}
              </span>
            )}
          </form>
          <button
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            className="px-3 py-1.5 text-sm bg-gray-200 rounded hover:bg-gray-300 transition-colors select-none"
          >
            Show Page
          </button>
        </div>
    </header>
  );
}
