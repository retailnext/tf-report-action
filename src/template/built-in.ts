export const BUILT_IN_TEMPLATES = ["default", "summary"] as const;
export type BuiltInTemplateName = (typeof BUILT_IN_TEMPLATES)[number];
