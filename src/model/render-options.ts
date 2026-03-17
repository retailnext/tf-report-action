export type DiffFormat = "inline" | "simple";

export interface RenderOptions {
  /**
   * Display title for the report. Omit for no title heading.
   */
  title?: string;
  /**
   * Whether to show unchanged attributes in resource detail tables.
   * Default: false.
   */
  showUnchangedAttributes?: boolean;
  /**
   * Diff format for inline attribute changes.
   * Default: "inline".
   */
  diffFormat?: DiffFormat;
}
