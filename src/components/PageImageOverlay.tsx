"use client";

import { getImagePath } from "../lib/constants";

interface Props {
  pageNumber: number;
  visible: boolean;
}

export default function PageImageOverlay({ pageNumber, visible }: Props) {
  if (!visible) return null;

  const src = getImagePath(pageNumber);

  return (
    <div className="absolute inset-0 z-10 bg-white flex items-center justify-center p-4">
      <img
        src={src}
        alt={`Page ${pageNumber}`}
        className="max-w-full max-h-full object-contain shadow-lg rounded"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}
