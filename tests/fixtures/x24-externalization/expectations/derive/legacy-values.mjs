// x24 derivation helper (CLI): pins the base-tree business values by canonical SHA-256 without copying
// them. It reads the cited base lines as text, extracts literals with a small literal tokenizer and never
// imports or executes those sources; no value, identifier or literal-bearing path is written here (files
// are named by masked path, object keys are mapped through their SHA-256). Run from the repository root:
//   node tests/fixtures/x24-externalization/expectations/derive/legacy-values.mjs --files files.lst \
//     [--root <extracted base tree>] --out legacy-values.json
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { canonical, canonicalSha256 } from "./canonical.mjs";
import { maskPath } from "./scan.mjs";

const here = dirname(new URL(import.meta.url).pathname);
const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const root = arg("root") ?? ".";
const lexicon = JSON.parse(readFileSync(join(here, "../lexicon.json"), "utf8"));
const real = new Map(readFileSync(arg("files"), "utf8").split("\0").filter(Boolean).map((p) => [maskPath(p, lexicon), p]));
const sha = (b) => createHash("sha256").update(b).digest("hex");
const cache = new Map();
function src(file) {
  if (!cache.has(file)) {
    const path = real.get(file);
    if (!path) throw new Error(`no tracked file with masked path ${file}`);
    const bytes = readFileSync(join(root, path));
    cache.set(file, { bytes, lines: bytes.toString("utf8").split("\n") });
  }
  return cache.get(file);
}
const span = (file, a, b = a) => ({ file, lines: a === b ? `${a}` : `${a}-${b}`, sourceSha256: sha(src(file).bytes) });
const lines = (file, a, b = a) => src(file).lines.slice(a - 1, b).join("\n");

/** Tokenizer and parser for the JS literal subset used by the pinned spans; identifiers become {ref}. */
function parseLiteral(text) {
  let i = 0;
  const ws = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  const str = () => {
    const m = /^"(?:[^"\\]|\\.)*"/.exec(text.slice(i));
    i += m[0].length;
    return JSON.parse(m[0]);
  };
  const value = () => {
    ws();
    const c = text[i];
    if (c === "{" || c === "[") {
      i++;
      const out = c === "{" ? {} : [];
      for (;;) {
        ws();
        if (text[i] === (c === "{" ? "}" : "]")) {
          i++;
          return out;
        }
        if (c === "{") {
          let key;
          if (text[i] === '"') key = str();
          else {
            const m = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
            key = m[0];
            i += key.length;
          }
          ws();
          if (text[i++] !== ":") throw new Error(`expected a colon at ${i}`);
          out[key] = value();
        } else out.push(value());
        ws();
        if (text[i] === ",") i++;
      }
    }
    if (c === '"') return str();
    const m = /^(-?\d+(?:\.\d+)?|true|false|[A-Za-z_$][\w$]*)/.exec(text.slice(i));
    if (!m) throw new Error(`unexpected literal text at ${i}`);
    i += m[0].length;
    if (m[0] === "true" || m[0] === "false") return m[0] === "true";
    return /^-?\d/.test(m[0]) ? Number(m[0]) : { ref: m[0] };
  };
  return value();
}
/** Literal initialiser of a declaration spanning the given lines: the text after the first "=", unwrapped. */
const initialiser = (file, a, b) => lines(file, a, b).replace(/^[^=]*=\s*/, "").replace(/^Object\.freeze\(/, "").replace(/;\s*$/, "").replace(/\s+as const$/, "").replace(/\)\s*$/, "");
const objectAt = (file, a, b = a) => parseLiteral(initialiser(file, a, b));
/** The numeric initialiser of the constant declared on one line. */
const numberAt = (file, line) => {
  const m = /^(?:export )?const [A-Za-z_]+ = (-?[\d.]+);/.exec(lines(file, line));
  if (!m) throw new Error(`no numeric constant at ${file}:${line}`);
  return Number(m[1]);
};
/** Every numeric constant of a file by name (names stay in memory). */
const constantsOf = (file) => new Map(src(file).lines.flatMap((l) => {
  const m = /^(?:export )?const ([A-Za-z_]+) = (-?[\d.]+);/.exec(l);
  return m ? [[m[1], Number(m[2])]] : [];
}));
const stringsOn = (file, line) => [...lines(file, line).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => JSON.parse(`"${m[1]}"`));
const integersOn = (file, line) => (lines(file, line).match(/\d+/g) ?? []).map(Number);
const equal = (a, b, what) => {
  if (canonical(a) !== canonical(b)) throw new Error(`legacy duplicate disagrees: ${what}`);
  return a;
};
/** Value of the key of `object` whose SHA-256 is `keySha` (null when absent). */
const byKeyShaOrNull = (object, keySha) => {
  const k = Object.keys(object).find((key) => sha(key) === keySha);
  return k === undefined ? null : object[k];
};
const byKeySha = (object, keySha) => {
  const v = byKeyShaOrNull(object, keySha);
  if (v === null) throw new Error(`no key with digest ${keySha.slice(0, 12)}`);
  return v;
};

// Masked paths of the cited base files.
const F = {
  annotations: "src/internal/annotations.ts",
  layout: "src/internal/swimlaneLayout.ts",
  metrics: "src/internal/textMetrics.ts",
  canvas: "src/internal/canvas.ts",
  engine: "src/internal/engine.ts",
  autoLayout: "src/internal/layout/autoLayout.ts",
  drawio: "src/io/reference-drawio.ts",
  decode: "src/io/drawio-decode.ts",
  model: "src/io/reference-model.ts",
  descriptor: "src/io/{LX-DS-2:37bb91b5}",
  tokens: "src/profiles/{LX-TH-1:ba29297b}/tokens.ts",
  style: "src/profiles/{LX-TH-1:ba29297b}/style.ts",
  renderer: "src/profiles/{LX-TH-1:ba29297b}/renderer.ts",
  palette: "src/profiles/{LX-TH-1:ba29297b}/palette.ts",
  workshop: "src/react/workshop.tsx",
};

const values = {};
const pin = (field, value, sources, note) => {
  values[field] = { sha256: canonicalSha256(value), sources, ...(note ? { note } : {}) };
  return value;
};

// classification
const marker = (line) => {
  const m = /\\\[(\w+)\\\]/.exec(lines(F.annotations, line));
  return `[${m[1]}]`;
};
const docPrefix = marker(7);
const appPrefix = marker(11);
pin("classification", {
  annotationRoles: [
    { role: "document", prefix: docPrefix, trim: "ecma262-2024-start", labelCase: "none" },
    { role: "application", prefix: appPrefix, trim: "ecma262-2024-start", labelCase: "none" },
  ],
  insertSeparator: stringsOn(F.palette, 71).at(-1).slice(docPrefix.length),
}, [span(F.annotations, 7), span(F.annotations, 11), span(F.palette, 71, 72)], "Role markers of the base tree, recognised after the ECMAScript leading trim (JS \\s), and the one-space insertion separator.");

// attachment
pin("attachment.applicationHost", { type: "bpmn:Activity", mode: "assignable" },
  [span(F.renderer, 74, 76), span(F.model, 32)],
  "The implicit link retarget of the base layout input is not pinned: business-policy/1 admits only preserve-report (UNSEALED, OPEN-MIGRATION).");

// metrics
const digits = (a, b) => lines(F.metrics, a, b).match(/\d+/g).map(Number);
const regular = digits(25, 28);
const bold = digits(30, 33);
if (regular.length !== 95 || bold.length !== 95) throw new Error("width tables are not 95 entries");
pin("metrics.tables", { regular, bold, fallback: numberAt(F.metrics, 41), lineHeight: numberAt(F.layout, 55) },
  [span(F.metrics, 24, 33), span(F.metrics, 41), span(F.layout, 55)], "Release-derived regular and bold advance tables (per mille em, ASCII 32..126), fallback width and wrapping line height. The complete alias table equivalent to the ambient canonical decomposition is UNSEALED (metrics owned by the private integration).");

// navigation
pin("navigation", { mode: "legacy-default" }, [span(F.workshop, 130, 143)]);

// presentation.layout: node kinds are mapped to business-policy/1 slots by the SHA-256 of their key, in source order.
const SLOTS = [
  ["e3091486247e1aa08c721716ec36c40e218a9c3b84aff13396fa0f6e2b4d8b5d", "task"],
  ["92575f45d23390198ed05f9557cad2ce1f6017eb70aedd8a2a6f86f16a2f345c", "subprocess"],
  ["da3c754b798d38fb62714b8d5d95e477941af8476f106708927da47612e4d563", "call"],
  ["c4cb1e84812004f5b6dbb31c579662c23d82f924bea5eda6bb7c7113b17377f1", "gateway"],
  ["39f17ec6ebcf3cec37a06d85dc61882be3898d7573f284b7b41222087b6b6a2c", "start"],
  ["b891f9e2a69626266100a5fa3161423408bdf539816e578cc6464a315b138668", "end"],
  ["b3c5c91627ba8885b5f89fd86d55e5909e9f43446cfbe77c44ae4008930fbf15", "event"],
  ["8b00ab5820566467078bb0146e385defaa05b2fcd56c8529c8e58dd3ae80cfda", "object-in"],
  ["dbca668123efe23b182a0e042179b49aab7645c25d5eb2c84a1902c293639663", "object-out"],
  ["a96ff6bf6ea52737ffa4e9502f679f82ae3deaeaddb17d47d7ba70ec42acee50", "port-in"],
  ["0b97d234f4aba6fa350f5314b6ca1bae9f519030f7d89d97ee06be04d0841e18", "port-out"],
  ["e52e1d57122da276f479fa74ab692ccdefb04ca8c9ce88a42ea9626e5589cfd1", "document"],
];
const consts = constantsOf(F.layout);
const resolve = (v) => (typeof v === "object" && v && "ref" in v ? consts.get(v.ref) : v);
const sizes = objectAt(F.layout, 60, 65);
const sizeKeys = Object.keys(sizes);
if (sizeKeys.length !== SLOTS.length || sizeKeys.some((k, i) => sha(k) !== SLOTS[i][0])) throw new Error("node size keys differ from the pinned slots");
const nodeSizes = sizeKeys.map((k, i) => ({ kind: SLOTS[i][1], width: resolve(sizes[k][0]), height: resolve(sizes[k][1]) }));
const labelMax = objectAt(F.layout, 59);
const appBox = objectAt(F.style, 141);
const docBox = objectAt(F.style, 188);
const docMin = Number(/Math\.max\((\d+),/.exec(lines(F.layout, 132))[1]);
const gap = integersOn(F.autoLayout, 67).at(-1);
const inset = integersOn(F.autoLayout, 72).at(-1);
pin("presentation.layout", {
  poolHeader: numberAt(F.layout, 43), laneHeader: numberAt(F.layout, 44), minLaneHeight: numberAt(F.layout, 49), channel: numberAt(F.layout, 47),
  fontSize: numberAt(F.layout, 53), labelFontSize: numberAt(F.layout, 54), nodeSizes,
  labelMaxWidth: { event: byKeySha(labelMax, SLOTS[6][0]), item: byKeySha(labelMax, "8550f340539484c0a7d9425bd20e5bfe51e0c49b123d04ca527614b250880953") },
  appBadge: {
    minWidth: equal(numberAt(F.layout, 67), appBox.minWidth, "badge minimum width"), height: equal(numberAt(F.layout, 68), appBox.height, "badge height"),
    overlap: equal(numberAt(F.layout, 69), appBox.overlap, "badge overlap"), chrome: equal(numberAt(F.layout, 70), appBox.chrome, "badge chrome"),
    margin: equal(numberAt(F.layout, 71), appBox.margin, "badge margin"), gap: equal(appBox.gap, gap, "badge gap"), font: equal(appBox.font, numberAt(F.layout, 53), "badge font"), linkInset: inset,
  },
  document: {
    width: numberAt(F.layout, 72), minHeight: docMin, band: docBox.band, textTop: equal(numberAt(F.layout, 73), docBox.textTop, "document text top"),
    waveTop: equal(numberAt(F.layout, 74), docBox.waveTop, "document wave top"), padX: equal(numberAt(F.layout, 75), docBox.padX, "document padding"), padBottom: equal(numberAt(F.layout, 76), docBox.padBottom, "document bottom padding"),
  },
  laneHeaderWidth: numberAt(F.style, 174), poolStrip: numberAt(F.style, 175),
}, [span(F.layout, 43, 76), span(F.layout, 132), span(F.style, 141), span(F.style, 174, 175), span(F.style, 188), span(F.autoLayout, 67), span(F.autoLayout, 72)],
  "Node kinds are recorded under the business-policy/1 slot names, mapped from the base keys by SHA-256 in source order.");

// presentation.looks: the look registry keys are mapped to their renderer by the SHA-256 of the key.
const floor = objectAt(F.canvas, 69);
const LOOKS = [
  ["fe6d3468cf5c74d8ec2a95b40f2e05338c37a4202f8fad692d2b64a9cf9b468a", { renderer: "upstream", palette: "upstream" }],
  ["ba29297b6c4f8486cb3f92f5ff09f93ca5e16ceb198d9b5e159aa0ca47f94033", { renderer: "annotated", palette: "annotated", tokens: objectAt(F.tokens, 46, 80) }],
  ["ca8c522af0a0dfc10c8747ed205c4a650df4ccb350adbd450bbce753f6385c51", { renderer: "recolor", palette: "upstream", tokens: objectAt(F.tokens, 5, 39) }],
];
const selectors = stringsOn(F.canvas, 68)[0].split(", ");
pin("presentation.looks", LOOKS.map(([keySha, look]) => {
  const alias = Object.keys(floor).find((k) => sha(k) === keySha);
  if (alias === undefined) throw new Error("look registry key missing");
  const { tokens, ...rest } = look;
  return { alias, ...rest, flat: false, paletteFloor: floor[alias], markerSelectors: selectors, ...(tokens ? { tokens } : {}) };
}).map((l) => ({ alias: l.alias, renderer: l.renderer, flat: l.flat, palette: l.palette, paletteFloor: l.paletteFloor, markerSelectors: l.markerSelectors, ...(l.tokens ? { tokens: l.tokens } : {}) })),
[span(F.tokens, 5, 39), span(F.tokens, 46, 80), span(F.canvas, 68, 69), span(F.engine, 74, 105)], "Look registry of the base tree in business-policy/1 shape. The flat drawing option and the annotated palette option of the legacy API override flat and palette at selection time; the recolouring look adds no module without named tokens and follows the text colour for the label colour unless named.");
pin("presentation.legacyOptions", { flatDrawing: stringsOn(F.engine, 82)[0], annotatedPalette: stringsOn(F.engine, 94)[0] }, [span(F.engine, 82), span(F.engine, 94)],
  "Option values of the legacy look API that force flat drawing and add the annotated palette, compared as opaque keys.");

// presentation.exportStyles
const style = (line) => stringsOn(F.drawio, line)[0];
const task = style(15);
const sub = /\.replace\("([^"]+)", "([^"]+)"\)/.exec(lines(F.drawio, 24));
pin("presentation.exportStyles.drawio", {
  pool: style(11), lane: style(12), start: style(13), end: style(14), task, subprocess: task.replace(sub[1], sub[2]), gatewayBase: style(16), external: style(17),
  application: style(18), document: style(19), item: style(20), edgeHead: style(21), flowTail: style(22), linkTail: style(23), event: style(25),
  poolHeaderWidth: numberAt(F.drawio, 26), dx: numberAt(F.drawio, 27), dy: numberAt(F.drawio, 28), appBand: numberAt(F.drawio, 29),
}, [span(F.drawio, 11, 29)]);
const shapeApp = stringsOn(F.decode, 50)[0];
const [kindProc, kindComp] = [stringsOn(F.decode, 51), stringsOn(F.decode, 52)];
const shapeDoc = stringsOn(F.decode, 54)[0];
const linkSuffix = /\$\{node\.id\}([A-Za-z0-9_-]+)`/.exec(lines(F.decode, 130))[1];
pin("presentation.exportStyles.decode", {
  associationIdSuffix: linkSuffix,
  kinds: [
    { match: [{ key: "shape", value: shapeApp }, { key: kindProc[0], value: kindProc[1] }], kind: kindProc[2] },
    { match: [{ key: "shape", value: shapeApp }, { key: kindComp[0], value: kindComp[1] }], kind: kindComp[2] },
    { match: [{ key: "shape", value: shapeDoc }], kind: "textAnnotation" },
  ],
  roles: [
    { match: [{ key: stringsOn(F.decode, 107)[0], value: stringsOn(F.decode, 107)[1] }], role: "application" },
    { match: [{ key: stringsOn(F.decode, 108)[0], value: stringsOn(F.decode, 108)[1] }], role: "document" },
  ],
}, [span(F.decode, 50, 54), span(F.decode, 107, 108), span(F.decode, 130)], "The suffix of the synthesised association id of a decoded application annotation is injected (ledger rule R-064).");

// presentation.palette: the creation defaults of an entry sit under the key whose SHA-256 is CREATION_KEY.
const CREATION_KEY = "d410850fd5f4e0a3cbffa317eb15d8e3c8fe4bcdb7d77433d8618e0ddaca25cb";
if (!lexicon.entries.some((e) => e.match.some((m) => m.hashes?.some((h) => h.sha256 === CREATION_KEY)))) throw new Error("creation key is not a lexicon literal");
const icons = objectAt(F.palette, 33, 50);
const entries = parseLiteral(initialiser(F.palette, 52, 75));
pin("presentation.palette", {
  entries: entries.map((e) => {
    const create = byKeyShaOrNull(e, CREATION_KEY);
    return {
      id: e.id, title: e.title, bpmnType: e.bpmnType, group: e.group, icon: icons[e.id] ?? "bpmn-icon-task",
      ...(create?.name ? { initialName: create.name } : {}),
      ...(create?.text ? { initialRole: create.text.startsWith(docPrefix) ? "document" : create.text.startsWith(appPrefix) ? "application" : "unknown" } : {}),
      ...(create?.collapsed ? { collapsed: true } : {}),
      ...(e.tool ? { tool: e.tool } : {}),
    };
  }),
}, [span(F.palette, 33, 75)], "Gateway creation subtypes are dropped: the base palette provider never applies them.");

// exportFacts
const factsType = stringsOn(F.model, 37).find((s) => s.includes(":"));
const family = stringsOn(F.model, 171).find((s) => s.startsWith("http"));
const field = (line) => /\bv\.([A-Za-z]+)/.exec(lines(F.model, line))[1];
pin("exportFacts", {
  descriptorSha256: sha(src(F.descriptor).bytes), extensionType: factsType, namespaceFamily: family,
  properties: { order: field(177), direction: field(182), label: field(183), lane: field(184), primary: field(185), process: field(186) },
}, [span(F.descriptor, 1, 51), span(F.model, 37), span(F.model, 171), span(F.model, 177, 186)], "Facts descriptor package of the base tree (removed from the generic distribution), the facts type, namespace family and fact property names read by the reference exporter.");

const out = { format: "x24-legacy-values/2", note: "Canonical SHA-256 of each base-tree business value in business-policy/1 shape, recomputed from the cited base lines (files named by masked path). The private integration legacy data supplied to the legacy adapter must hash to these values field by field; the values themselves are not copied into this public seal.", canonical: "object keys sorted by UTF-16 code units, no whitespace, ECMAScript strings and numbers", values };
const target = arg("out");
if (target) writeFileSync(target, JSON.stringify(out, null, 1) + "\n");
else console.log(JSON.stringify(out, null, 1));
