import assert from "node:assert/strict";

export function assertDisputed(id, vector, observed, disputes) {
  // A disputed vector must still diverge exactly as recorded: the recorded
  // runtime outcome pins the behavior against silent drift, and a runtime
  // that now matches the seal reports the dispute as resolved.
  const dispute = disputes.disputes.find((entry) => (entry.vectors ?? []).some((ref) => ref === id));
  assert.ok(dispute, `${id} has a recorded dispute`);
  if (dispute.id === "D-02-presence") {
    const expected = { status: "ok", json: structuredClone(vector.expected.json), diagnostics: vector.expected.diagnostics };
    // The sole arbitration is native absence of an empty containment array.
    delete expected.json.rootElements[0].flowElements;
    assert.deepEqual(observed, expected, id);
    return;
  }
  if (dispute.id === "D-default-ns-qname") {
    const expected = { status: "ok", json: structuredClone(vector.expected.json), diagnostics: vector.expected.diagnostics ?? [] };
    const root = expected.json.rootElements[0].flowElements[0].extensionElements.values[0];
    // Pinned reader counters, including the default reset. No other name,
    // URI, attribute, body, child, property or diagnostic delta is allowed.
    root.$name.qname = "ns0:thing";
    if (vector.caseId === "generic-default-namespace") root.$children[0].$name.qname = "ns0:child";
    else if (vector.caseId === "generic-default-reset") {
      root.$children[0].$name.qname = "ns1:inner";
      root.$children[0].$children[0].$name.qname = "ns1:plain";
    } else assert.fail("unreviewed namespace arbitration");
    assert.deepEqual(observed, expected, id);
    return;
  }
  if (vector.expected.kind === "refused") {
    assert.equal(vector.expected.diagnostics.length, 1, "unreviewed refusal arbitration");
    assert.deepEqual(observed, { status: "refused", code: vector.expected.diagnostics[0].code, pointer: "" }, id);
    assert.notEqual(observed.pointer, vector.expected.diagnostics[0].pointer, `${id} dispute resolved; update the disputes record`);
    return;
  }
  assert.equal(vector.expected.diagnostics.length, 1, "unreviewed diagnostic arbitration");
  assert.deepEqual(observed, { status: "ok", json: vector.expected.json,
    diagnostics: [{ ...vector.expected.diagnostics[0], pointer: "" }] }, id);
  assert.notEqual(observed.diagnostics[0].pointer, vector.expected.diagnostics[0].pointer, `${id} dispute resolved; update the disputes record`);
}
