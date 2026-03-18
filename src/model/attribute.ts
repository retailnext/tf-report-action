export interface AttributeChange {
  name: string;
  before: string | null;
  after: string | null;
  isSensitive: boolean;
  /** True when the value is multi-line or structured JSON/XML, rendered collapsibly. */
  isLarge: boolean;
  /** True when the after value is "(known after apply)" */
  isKnownAfterApply: boolean;
}
