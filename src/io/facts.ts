import type { BusinessPolicy } from "../internal/business-policy.js";
import type { ModdleElement } from "../types.js";

export function factElement(element: ModdleElement, policy?: BusinessPolicy): ModdleElement | undefined {
  const type = policy?.exportFacts?.extensionType;
  return type ? element.extensionElements?.values?.find((value: ModdleElement) => value.$type === type) : undefined;
}
/** Translate the injected descriptor's property names to projection categories. */
export function factsOf(element: ModdleElement, policy?: BusinessPolicy): Record<string, any> | undefined {
  const native = factElement(element, policy), properties = policy?.exportFacts?.properties;
  if (!native || !properties) return undefined;
  return Object.fromEntries(Object.entries(properties).map(([category, field]) => [category, native[field]]));
}
