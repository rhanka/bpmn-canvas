/**
 * `[App]` and `[Doc]` text-annotation prefixes. A convention of the `legend` profile
 * and of the swimlane layout, not general BPMN semantics.
 */

export function isDocumentAnnotation(text: string | undefined): boolean {
  return /^\s*\[Doc\]/.test(text ?? "");
}

export function isAppAnnotation(text: string | undefined): boolean {
  return /^\s*\[App\]/.test(text ?? "");
}

/** Visible name of an `[App]`/`[Doc]` annotation. */
export function annotationName(text: string | undefined): string {
  return (text ?? "").replace(/^\s*\[(Doc|App)\]\s*/, "");
}
