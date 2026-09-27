export interface CategoryData {
  [pageNumber: string]: {
    [projectName: string]: string[];
  };
}

export type ProjectRenames = Record<string, Record<string, string>>;
export type ProjectAdditions = Record<string, string[]>;

export interface CategoryExportV4 {
  schemaVersion: 4;
  categories: CategoryData;
  renames: ProjectRenames;
  additions: ProjectAdditions;
}

export interface ValidatedImport {
  format: "legacy" | "v4";
  categories: CategoryData;
  renames: ProjectRenames;
  additions: ProjectAdditions;
}
