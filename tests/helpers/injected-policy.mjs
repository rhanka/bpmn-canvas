// Explicit caller policy assembled only from existing test inputs.
import { readFileSync, readdirSync } from "node:fs";
import { BpmnModdle } from "bpmn-moddle";
import { fixtureDescriptor } from "./injected-descriptor.mjs";
const base = new URL("../fixtures/", import.meta.url);
export const fixturePolicy = JSON.parse(readFileSync(new URL("x24-externalization/expectations/policy/policy-legacy-synthetic.json", base)));
const model = new BpmnModdle({ [fixtureDescriptor.prefix]: fixtureDescriptor });
const inputRoot = new URL("io/reference/C1/", base);
const nativeInputs = readdirSync(inputRoot).filter(name => name.endsWith(".bpmn") && readFileSync(new URL(name, inputRoot), "utf8").includes(fixtureDescriptor.uri));
if (nativeInputs.length !== 1) throw new Error("Ambiguous native fixture input");
const parsed = await model.fromXML(readFileSync(new URL(nativeInputs[0], inputRoot), "utf8"));
for (const role of fixturePolicy.classification.annotationRoles) {
  const input = Object.values(parsed.elementsById).find(element => element.$type === "bpmn:TextAnnotation" && element.id.startsWith(role.role === "document" ? "Doc_" : "App_"));
  const prefix = /^\[[^\]]+\]/.exec(input?.text ?? "")?.[0];
  if (!prefix) throw new Error("Missing explicit annotation input");
  role.prefix = prefix;
}
const extension = fixtureDescriptor.types[0];
fixturePolicy.exportFacts.extensionType = fixtureDescriptor.prefix + ":" + extension.name;
fixturePolicy.exportFacts.namespaceFamily = fixtureDescriptor.uri.replace(/\d+$/, "");
for (const key of Object.keys(fixturePolicy.exportFacts.properties)) {
  const local = property => property.ns?.localName ?? property.name.split(":").at(-1);
  const referenceTypes = { lane: "bpmn:Lane", primary: "bpmn:BaseElement", process: "bpmn:Process" };
  const field = extension.properties.find(property => local(property) === key || property.type === referenceTypes[key]);
  if (field) fixturePolicy.exportFacts.properties[key] = local(field);
}
export const fixtureOptions = { businessPolicy: fixturePolicy, descriptor: fixtureDescriptor };
