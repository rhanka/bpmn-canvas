/**
 * `[Component]` and `[Reference]` text-annotation prefixes. A convention of the `legend` profile
 * and of the swimlane layout, not general BPMN semantics.
 */

export function isDocumentAnnotation(text: string | undefined): boolean {
  return /^\s*\[Reference\]/.test(text ?? "");
}

export function isAppAnnotation(text: string | undefined): boolean {
  return /^\s*\[Component\]/.test(text ?? "");
}

/** Visible name of an `[Component]`/`[Reference]` annotation. */
export function annotationName(text: string | undefined): string {
  return (text ?? "").replace(/^\s*\[(Reference|Component)\]\s*/, "");
}
