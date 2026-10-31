import { annotationRole, roleLabel, type BusinessPolicy } from "./business-policy.js";

export function hasDocumentRole(text: string | undefined, policy?: BusinessPolicy): boolean {
  return annotationRole(text, policy)?.role === "document";
}

export function hasApplicationRole(text: string | undefined, policy?: BusinessPolicy): boolean {
  return annotationRole(text, policy)?.role === "application";
}

export function roleText(text: string | undefined, policy?: BusinessPolicy): string {
  return roleLabel(text, policy);
}

export * from "./role-exports.js";
