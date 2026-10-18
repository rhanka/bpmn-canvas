// Opaque role names are supplied by the caller, never inferred by library code.
export const supportRoles = [
  { role: "collaboration", ownerType: "bpmn:Process", type: "bpmn:Collaboration", parentRole: "root", property: "rootElements" },
  { role: "main-participant", ownerType: "bpmn:Process", type: "bpmn:Participant", parentRole: "collaboration", property: "participants", ownerReference: "processRef" },
  { role: "reference-band", ownerType: "bpmn:Process", type: "bpmn:Participant", parentRole: "collaboration", property: "participants", absent: ["processRef"] },
  { role: "lane-set", ownerType: "bpmn:Process", type: "bpmn:LaneSet", parentRole: "owner", property: "laneSets" },
  { role: "external-lane", ownerType: "bpmn:Process", type: "bpmn:Lane", parentRole: "lane-set", property: "lanes" }
];
