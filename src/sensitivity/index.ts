/**
 * Portions of this file are derived from tfplan2md by oocx (https://github.com/oocx/tfplan2md),
 * used under the MIT License.
 */

/**
 * Yields the key itself followed by all ancestor paths, from most to least specific.
 *
 * @example
 * getHierarchicalPaths("variable[0].secret_value")
 * // => ["variable[0].secret_value", "variable[0]", "variable"]
 */
export function getHierarchicalPaths(key: string): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();

  let current = key;
  while (current.length > 0) {
    if (!seen.has(current)) {
      seen.add(current);
      paths.push(current);
    }

    // Try stripping a trailing dotted segment: "a.b.c" → "a.b"
    const dotIdx = current.lastIndexOf(".");
    // Try stripping a trailing array index: "a[0]" → "a"
    const bracketIdx = current.lastIndexOf("[");

    if (dotIdx > bracketIdx && dotIdx !== -1) {
      current = current.slice(0, dotIdx);
    } else if (bracketIdx !== -1) {
      current = current.slice(0, bracketIdx);
    } else {
      break;
    }
  }

  return paths;
}

/**
 * Returns true if the attribute at `key` (or any of its ancestor paths) is
 * marked sensitive in either the before or after sensitivity maps.
 * Sensitivity maps are produced by flattening before_sensitive / after_sensitive.
 * The value "true" (string) indicates sensitivity.
 */
export function isSensitive(
  key: string,
  beforeSensitive: Map<string, string | null>,
  afterSensitive: Map<string, string | null>,
): boolean {
  // Root boolean: empty-string key with value "true" → everything is sensitive
  if (beforeSensitive.get("") === "true" || afterSensitive.get("") === "true") {
    return true;
  }

  for (const path of getHierarchicalPaths(key)) {
    if (
      beforeSensitive.get(path) === "true" ||
      afterSensitive.get(path) === "true"
    ) {
      return true;
    }
  }
  return false;
}
