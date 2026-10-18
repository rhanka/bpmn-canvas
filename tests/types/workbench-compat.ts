import { hydrate, project, semanticDescriptor, serializeBpmn } from "../../src/io/index.js";
import type { BpmnDefinitions, BpmnXmlOptions, JsonCodecConfiguration, ModdleJsonElement } from "../../src/io/index.js";

const configuration: JsonCodecConfiguration = { contractVersion: "1", defaults: "explicit", descriptors: { sem: semanticDescriptor } };
const json: ModdleJsonElement = { $type: "bpmn:Definitions", rootElements: [] };
const model: BpmnDefinitions = hydrate(json, configuration);
export const projected: ModdleJsonElement = project(model, configuration);
const options: BpmnXmlOptions = { format: true, preamble: true };
export const bytes: Promise<Uint8Array> = serializeBpmn(model, options);
// @ts-expect-error XML options must be explicit at the native writer boundary.
serializeBpmn(model);
// @ts-expect-error Configuration is mandatory at the native proof boundary.
hydrate(json);
// @ts-expect-error Runtime descriptor objects do not belong to the wire JSON type.
const invalidJson: ModdleJsonElement = { $type: "bpmn:Definitions", hook: () => undefined };
void invalidJson;
