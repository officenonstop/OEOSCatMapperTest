"use client";

interface Props {
  name: string;
  selected: boolean;
  onToggle: () => void;
  // Group background for grouped view. Applied as inline style because Tailwind JIT
  // cannot generate classes from runtime values. Hover uses a brightness filter so it
  // works on top of the inline color (hover:bg-* would be defeated by it).
  bgColor?: string;
}

export default function CategoryCard({ name, selected, onToggle, bgColor }: Props) {
  const grouped = bgColor !== undefined;
  return (
    <button
      onClick={onToggle}
      style={grouped ? { backgroundColor: bgColor } : undefined}
      className={`flex items-center gap-2 px-2 py-1 rounded text-xs border transition-colors ${
        grouped
          ? selected
            ? "border-gray-900 ring-1 ring-gray-900 text-black hover:brightness-95"
            : "border-gray-400 text-black hover:brightness-95"
          : selected
            ? "bg-blue-100 border-blue-400 text-blue-800"
            : "bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
      }`}
    >
      <span className={`w-3 h-3 rounded border flex items-center justify-center text-[8px] font-bold ${
        selected ? "bg-blue-600 border-blue-600 text-white" : grouped ? "border-gray-500" : "border-gray-400"
      }`}>
        {selected ? "✓" : ""}
      </span>
      {name}
    </button>
  );
}
