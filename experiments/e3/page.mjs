import Modeler from "bpmn-js/lib/Modeler";
import "diagram-js/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-js.css";

const BPMN = "http://www.omg.org/spec/BPMN/20100524/MODEL";
const BPMNDI = "http://www.omg.org/spec/BPMN/20100524/DI";

const parse = (xml) => new DOMParser().parseFromString(xml, "application/xml");
const byId = (doc, id) => doc.querySelector(`[id="${id}"]`);
const attr = (doc, id, name) => byId(doc, id)?.getAttribute(name) ?? null;

async function runCase(spec, xml) {
  const record = { name: spec.name, steps: [], checks: [], errors: [] };
  const step = (what, data) => record.steps.push({ what, ...data });
  const check = (name, pass, detail) => record.checks.push({ name, pass: !!pass, detail: detail ?? null });

  const container = document.createElement("div");
  container.style.cssText = "width:900px;height:600px;position:relative";
  container.dataset.case = spec.name;
  document.body.appendChild(container);

  const modeler = new Modeler({ container });
  try {
    const imp = await modeler.importXML(xml);
    step("importXML", { warnings: imp.warnings.map((w) => w.message) });

    const defs = modeler.getDefinitions();
    const diagrams = defs.diagrams.map((d) => ({ id: d.id, name: d.name ?? null, plane: d.plane.bpmnElement?.id ?? null }));
    step("diagrams in definitions", { diagrams });

    const canvas = modeler.get("canvas");
    const registry = modeler.get("elementRegistry");
    const modeling = modeler.get("modeling");
    const stack = modeler.get("commandStack");
    const activeRoot = () => canvas.getRootElement()?.businessObject?.id ?? null;
    step("active root after import", { root: activeRoot(), canUndo: stack.canUndo() });

    // Baseline: save without edit.
    const before = (await modeler.saveXML({ format: true })).xml;
    step("saveXML before edits", { bytes: before.length, equalsInput: before === xml });

    let first = true;
    for (const edit of spec.edits) {
      if (edit.open) {
        const canUndoBefore = stack.canUndo();
        let openErr = null;
        try {
          const r = await modeler.open(edit.open);
          step(`open(${edit.open})`, { warnings: (r?.warnings ?? []).map((w) => w.message), root: activeRoot(), canUndoBefore, canUndoAfter: stack.canUndo() });
        } catch (e) {
          openErr = String(e && e.message ? e.message : e);
          step(`open(${edit.open})`, { error: openErr });
        }
        check(`open(${edit.open}) succeeds`, !openErr, openErr);
      }
      const el = registry.get(edit.element);
      check(`element ${edit.element} present in registry after ${edit.open ? "open(" + edit.open + ")" : "import"}`, !!el, el ? null : `registry has: ${registry.getAll().map((e) => e.id).join(",")}`);
      if (el) {
        modeling.updateProperties(el, { name: edit.name });
        if (el.x !== undefined && !el.businessObject.$instanceOf("bpmn:Participant")) {
          edit.expectX = el.x + 10;
          modeling.moveElements([el], { x: 10, y: 0 });
          step(`moveElements ${edit.element}`, { x: el.x });
        }
        step(`updateProperties ${edit.element}`, { name: edit.name, canUndo: stack.canUndo() });
      }
      first = false;
    }

    if (spec.revisit) {
      await modeler.open(spec.revisit.open);
      const el = registry.get(spec.revisit.element);
      check(`after returning to ${spec.revisit.open}, ${spec.revisit.element} still shows "${spec.revisit.expectName}"`, el?.businessObject?.name === spec.revisit.expectName, el?.businessObject?.name ?? "missing");
    }

    const after = await modeler.saveXML({ format: true });
    record.savedXml = after.xml;
    const doc = parse(after.xml);
    check("saved XML parses", !doc.querySelector("parsererror"));

    for (const edit of spec.edits) {
      check(`saved XML has ${edit.element} name "${edit.name}"`, attr(doc, edit.element, "name") === edit.name, attr(doc, edit.element, "name"));
    }
    for (const edit of spec.edits) {
      if (edit.expectX === undefined) continue;
      const shape = [...doc.getElementsByTagNameNS(BPMNDI, "BPMNShape")].find((n) => n.getAttribute("bpmnElement") === edit.element);
      const bounds = shape?.getElementsByTagNameNS("http://www.omg.org/spec/DD/20100524/DC", "Bounds")[0];
      check(`saved DI of ${edit.element} moved to x=${edit.expectX}`, Number(bounds?.getAttribute("x")) === edit.expectX, bounds?.getAttribute("x") ?? "no bounds");
    }
    for (const id of spec.mustExist) check(`id ${id} survives`, !!byId(doc, id));
    for (const [id, name, expected] of spec.attrs) check(`${id}@${name} = ${expected}`, attr(doc, id, name) === expected, attr(doc, id, name));
    check(`BPMNDiagram count = ${spec.diagramCount}`, doc.getElementsByTagNameNS(BPMNDI, "BPMNDiagram").length === spec.diagramCount, doc.getElementsByTagNameNS(BPMNDI, "BPMNDiagram").length);

    // Dangling-reference scan: every *Ref / bpmnElement attribute must resolve to an id.
    const ids = new Set([...doc.querySelectorAll("[id]")].map((n) => n.getAttribute("id")));
    const dangling = [];
    for (const n of doc.getElementsByTagName("*")) {
      for (const a of n.attributes) {
        if ((/Ref$/.test(a.name) || a.name === "bpmnElement") && !ids.has(a.value)) dangling.push(`${n.getAttribute("id") ?? n.localName}@${a.name}=${a.value}`);
      }
    }
    check("no dangling reference attributes", dangling.length === 0, dangling);

    record.watermark = (() => {
      const w = container.querySelector(".bjs-powered-by");
      if (!w) return { present: false };
      const r = w.getBoundingClientRect();
      const link = w.tagName === "A" ? w : w.querySelector("a");
      return { present: true, tag: w.tagName, href: link?.getAttribute("href") ?? null, target: link?.getAttribute("target") ?? null, display: getComputedStyle(w).display, rect: { w: r.width, h: r.height } };
    })();
  } catch (e) {
    record.errors.push(String(e && e.stack ? e.stack : e));
  } finally {
    modeler.destroy();
    container.remove();
  }
  return record;
}

window.runE3 = async (cases) => {
  const out = [];
  for (const c of cases) out.push(await runCase(c.spec, c.xml));
  return out;
};
window.__e3Ready = true;
