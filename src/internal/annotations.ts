import { annotationRole, roleLabel, type BusinessPolicy } from "./business-policy.js";

export function isDocumentRole(text: string | undefined, policy?: BusinessPolicy): boolean {
  return annotationRole(text, policy)?.role === "document";
}

export function isAppAnnotation(text: string | undefined, policy?: BusinessPolicy): boolean {
  return annotationRole(text, policy)?.role === "application";
}

export function annotationName(text: string | undefined, policy?: BusinessPolicy): string {
  return roleLabel(text, policy);
}
