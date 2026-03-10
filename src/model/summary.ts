export interface Summary {
  add: number;
  change: number;
  destroy: number;
  replace: number;
  /** Total of add + change + destroy + replace */
  total: number;
}
