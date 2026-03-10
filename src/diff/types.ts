export type DiffKind = "added" | "removed" | "unchanged";

export interface DiffEntry {
  kind: DiffKind;
  value: string;
}

export interface LcsPair {
  beforeIndex: number;
  afterIndex: number;
}
