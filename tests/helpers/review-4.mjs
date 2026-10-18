export const artifactPlacements = [
  ["document annotation", ["Doc_Shipping_policy"]],
  ["document association", ["DocLink_Shipping_policy_Ship_order"]],
  ["document annotation and association", ["Doc_Shipping_policy", "DocLink_Shipping_policy_Ship_order"]],
  ["application annotation", ["App_Check_order"]],
  ["application association", ["AppLink_Check_order"]],
  ["application annotation and association", ["App_Check_order", "AppLink_Check_order"]],
];

export const associationEndpoints = [
  ["document source", "DocLink_Shipping_policy_Ship_order", "sourceRef"],
  ["document target", "DocLink_Shipping_policy_Ship_order", "targetRef"],
  ["application source", "AppLink_Check_order", "sourceRef"],
  ["application target", "AppLink_Check_order", "targetRef"],
];

export function moveArtifacts(m, ids) {
  const process = m.elementsById.Order_handling, collaboration = m.elementsById.Order_handling_collab;
  for (const id of ids) {
    const artifact = m.elementsById[id];
    process.artifacts = process.artifacts.filter((e) => e !== artifact);
    collaboration.artifacts = [...(collaboration.artifacts ?? []), artifact];
    artifact.$parent = collaboration;
  }
}

export function detachEndpoint(m, associationId, field) {
  const association = m.elementsById[associationId], canonical = association[field];
  // A detached same-ID subtree must never stand in for the canonical Task or
  // annotation. XML cannot encode this object-identity corruption.
  association[field] = m.moddle.create("bpmn:SubProcess", {
    id: canonical.id,
    flowElements: [m.moddle.create("bpmn:Task", { id: "Detached_nested_task" })],
  });
  return canonical;
}
