/**
 * RenderOptions — display options that control how reports are rendered.
 *
 * This type is the single source of truth for render-time options. It is
 * consumed by the builder (to forward options to the renderer) and by the
 * pipeline entry points.
 */
import type { DiffFormat } from "../diff/types.js";

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
