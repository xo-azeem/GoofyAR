export type ModelSource = { uri: string } | number;

export type ModelStats = {
  triangles: number;
  meshes: number;
  nodes: number;
  images: number;
  animations: string[];
  generator?: string;
};

export type LibraryModel = {
  id: string;
  name: string;
  /** File size in bytes. */
  size: number;
  /** Where the model came from: shipped with the app, or imported by the user. */
  origin: 'bundled' | 'imported';
  /** Metro asset id for bundled models, or a file:// URI for imported ones. */
  source: ModelSource;
  stats: ModelStats;
  addedAt: number;
};
