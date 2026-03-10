import type { Template } from "./types.js";
import { BUILT_IN_TEMPLATES } from "./built-in.js";

/**
 * Resolves a template name. Currently only built-in templates are supported.
 * Throws if the name is not recognized.
 */
export function resolveTemplate(name: string): Template {
  const isBuiltIn = (BUILT_IN_TEMPLATES as readonly string[]).includes(name);
  if (!isBuiltIn) {
    throw new Error(
      `Unknown template: "${name}". Valid templates are: ${BUILT_IN_TEMPLATES.join(", ")}`,
    );
  }
  return { name };
}
