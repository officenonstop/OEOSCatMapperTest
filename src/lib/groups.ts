import { CATEGORIES } from "./constants";

export type ViewMode = "sorted" | "grouped";

export interface CategoryGroup {
  name: string;
  bg: string;
  categories: string[];
}

// Group membership transcribed from Grouped-Categories.txt (file order preserved).
// The "Color:" lines in that file are intentionally overridden (see grouped-categories.md §4):
// the requirement mandates VIBGYOR + white, and pale pastels keep black text legible (WCAG).
// Applied via inline style — Tailwind JIT cannot generate interpolated color classes.
export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    name: "Group 1",
    bg: "#E6E0F8", // violet pastel
    categories: [
      "Residential", "Master Planning & Urban Design", "Commercial & Retail",
      "Hotel & Hospitality", "Healthcare", "Infrastructure", "Sports",
      "Institution", "I-Euro & Social", "Green Buildings", "Iconic",
      "Ideas", "Social Housing", "Sustainable",
    ],
  },
  {
    name: "Group 2",
    bg: "#D8D8F0", // indigo pastel
    categories: [
      "Redevelopment", "SRA", "Mixed-Use", "High Density Residential",
      "Skyscrapers", "Govt. Aspiration Houses", "Large Scale Integrated Township",
      "High-Rise", "Facade", "Competition winner", "Compact Housing",
    ],
  },
  {
    name: "Group 3",
    bg: "#CFE8FF", // blue pastel
    categories: [
      "Villa", "Branded Plotted Development", "Large Scale Master Planning",
      "Urban Design", "Amenities", "Large Scale Development", "Luxury Housing",
      "Podium Top Garden", "Rooftop Garden", "Vastu Housing",
    ],
  },
  {
    name: "Group 4",
    bg: "#D9F2D9", // green pastel
    categories: [
      "Workplaces", "Business Centers", "Co-Working Facilities", "IT Parks",
      "SEZ", "Commercial Mixed-Use", "Data Centers", "Incubation Center",
      "Research & Development Center",
    ],
  },
  {
    name: "Group 5",
    bg: "#FFF7CC", // yellow pastel
    categories: [
      "Hotels", "Resort", "Club", "Boutique", "Tourism", "Amusement Park",
      "Recreation", "Naturopathy", "Interiors", "Waterfront",
    ],
  },
  {
    name: "Group 6",
    bg: "#FFE0C2", // orange pastel
    categories: [
      "Hospitals", "Research & Diagnostic Center", "Rehabilitation Center",
    ],
  },
  {
    name: "Group 7",
    bg: "#FAD4D0", // red pastel
    categories: [
      "Sports City", "Stadium", "Outdoor Stadium", "Sports Club", "Game Zone",
    ],
  },
  {
    name: "Group 8",
    bg: "#FFFFFF", // white
    categories: [
      "University", "School", "Campus Design", "Training Center",
    ],
  },
];

// Integrity invariant (grouped-categories.md review B4): the hand-transcribed groups
// must cover exactly the same set as CATEGORIES — a typo here would silently drop a
// category from the grouped view while sorted mode keeps rendering it.
const groupedNames = CATEGORY_GROUPS.flatMap((group) => group.categories);
const uniqueNames = new Set(groupedNames);
const sortedCategories = [...CATEGORIES].sort();
const isExactCover =
  groupedNames.length === CATEGORIES.length &&
  uniqueNames.size === CATEGORIES.length &&
  [...uniqueNames].sort().every((name, index) => name === sortedCategories[index]);

if (!isExactCover) {
  throw new Error(
    "CATEGORY_GROUPS must contain every CATEGORIES entry exactly once " +
    `(groups: ${groupedNames.length}, unique: ${uniqueNames.size}, categories: ${CATEGORIES.length})`
  );
}
