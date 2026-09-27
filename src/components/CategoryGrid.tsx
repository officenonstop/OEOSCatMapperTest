"use client";

import { CATEGORIES } from "../lib/constants";
import { CATEGORY_GROUPS } from "../lib/groups";
import { useProject } from "../context/ProjectContext";
import CategoryCard from "./CategoryCard";

export default function CategoryGrid() {
  const { selectedCategories, toggleCategory, viewMode } = useProject();

  if (viewMode === "grouped") {
    return (
      <div className="flex flex-col gap-3">
        {CATEGORY_GROUPS.map((group) => (
          <section
            key={group.name}
            data-testid="group-section"
            className="rounded border border-gray-400 overflow-hidden"
            style={{ backgroundColor: group.bg }}
          >
            <div className="px-2 py-1 text-xs font-semibold text-black border-b border-black/10">
              {group.name} ({group.categories.length})
            </div>
            <div className="grid grid-cols-4 gap-1.5 p-1.5">
              {group.categories.map((cat) => (
                <CategoryCard
                  key={cat}
                  name={cat}
                  selected={selectedCategories.includes(cat)}
                  onToggle={() => toggleCategory(cat)}
                  bgColor={group.bg}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 gap-1.5 h-full content-start">
      {CATEGORIES.map((cat) => (
        <CategoryCard
          key={cat}
          name={cat}
          selected={selectedCategories.includes(cat)}
          onToggle={() => toggleCategory(cat)}
        />
      ))}
    </div>
  );
}
