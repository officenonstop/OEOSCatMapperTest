import type { Metadata } from "next";
import "./globals.css";
import { ProjectProvider } from "../context/ProjectContext";

export const metadata: Metadata = {
  title: "CatMapper",
  description: "Map categories to architecture projects",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ProjectProvider>{children}</ProjectProvider>
      </body>
    </html>
  );
}
