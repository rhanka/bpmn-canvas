import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BpmnWorkshop } from "../dist/react/index.js";
import { JSDOM } from "jsdom";
import { readFileSync, readdirSync } from "node:fs";
import { createDescriptorContext } from "../dist/profile/index.js";
import { compileFor, inputsOf } from "./helpers/lot5-runtime.mjs";

test("workshop routes an explicit native profile to its native host", () => {
  const markup = renderToStaticMarkup(createElement(BpmnWorkshop, {
    businessProfile: {}, descriptorContext: {}, snapshot: {}, metricBytes: new Map(),
    formats: [{ id: "drawing", label: "Drawing", themeId: "plain", formatId: "drawing" }],
  }));
  assert.match(markup, /data-native-workshop/);
});

test("native workshop publishes one committed change and one final download", { timeout: 30000 }, async () => {
  const fixtureRoot = new URL("./fixtures/lot5-ui/expectations/", import.meta.url);
  const record = id => JSON.parse(readFileSync(new URL(`cases/${readdirSync(new URL("cases/", fixtureRoot)).find(f => f.includes(id))}`, fixtureRoot)));
  const c = record("workshop-003"), inputs = inputsOf(c), build = await compileFor(c);
  const bytes = readFileSync(new URL("fixtures/ui-neutral-descriptors.json", fixtureRoot));
  const descriptor = createDescriptorContext(build.profile.descriptors.map(pin => ({ ...pin, descriptorBytes: bytes })));
  assert.equal(descriptor.status, "ok");
  const dom = new JSDOM("<main></main>", { pretendToBeVisual: true });
  const saved = new Map();
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, IS_REACT_ACT_ENVIRONMENT: true })) {
    saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, writable: true, configurable: true });
  }
  const { createRoot } = await import("react-dom/client"), { act } = await import("react");
  const root = createRoot(dom.window.document.querySelector("main"));
  const changes = [], downloads = [];
  let handle, resolveDownload;
  const downloaded = new Promise(resolve => { resolveDownload = resolve; });
  try {
    await act(async () => {
      root.render(createElement(BpmnWorkshop, {
        businessProfile: build.compiled, descriptorContext: descriptor.payload, snapshot: inputs.snapshot,
        metricBytes: build.metricBytes, formats: [inputs["format-option"] ? { ...inputs["format-option"], id: "drawing" } : {}],
        onReady(value) { handle = value; }, onChange(value) { changes.push(value); },
        onDownload(file, context) { downloads.push({ file, context }); resolveDownload(); },
      }));
    });
    assert.ok(handle, "native workshop must expose the initialized native handle");
    assert.equal(changes.length, 0);
    const command = record("fields-009").commandArtifact.json;
    await act(async () => { const result = await handle.applyCommands(command); assert.equal(result.status, "ok", result.code); });
    assert.equal(changes.length, 1);
    assert.equal(changes[0].origin, "command");
    const button = [...dom.window.document.querySelectorAll("button")].find(node => node.textContent === "Download");
    await act(async () => { button.click(); await downloaded; });
    assert.equal(downloads.length, 1);
    assert.match(new TextDecoder().decode(downloads[0].file.bytes), /^<mxfile[ >]/);
    assert.deepEqual(downloads[0].context.profileIdentity, build.identity);
    assert.equal(downloads[0].context.semanticRevision, handle.getSnapshot().payload.envelope.semanticRevision);
    assert.equal(downloads[0].context.report.operation, "prepareExport");
    assert.ok(downloads[0].context.idMap.length > 0);
    assert.equal(changes.length, 1);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
