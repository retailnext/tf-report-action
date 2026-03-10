import type { ResourceChange } from "./resource.js";
import type { OutputChange } from "./output.js";

export interface ModuleGroup {
  /** Empty string for the root module. */
  moduleAddress: string;
  resources: ResourceChange[];
  outputs: OutputChange[];
}
