"use client";

import { useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import CategoryGrid from "../components/CategoryGrid";
import PageImageOverlay from "../components/PageImageOverlay";
import { useProject } from "../context/ProjectContext";

export default function Home() {
  const { currentPage } = useProject();
  const [showImage, setShowImage] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex flex-col flex-1 min-w-0">
        <Header setShowImage={setShowImage} />
        <div className="flex-1 p-4 overflow-y-auto relative">
          <div className={showImage ? "invisible" : ""}>
            <CategoryGrid />
          </div>
          <PageImageOverlay pageNumber={currentPage} visible={showImage} />
        </div>
      </main>
    </div>
  );
}
