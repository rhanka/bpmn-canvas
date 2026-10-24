import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { compareCase } from "./fixtures/lot3-cn/expectations/comparators/lot3-comparators.mjs";
import { compileByPath } from "./helpers/lot3-compile.mjs";
import { canonicalize, rawDigest } from "../dist/profile/canonical.js";
import { planRecipe, applyPlan } from "../dist/profile/planning.js";
import { complete } from "../dist/profile/completion.js";
import { normalize } from "../dist/profile/normalize.js";
import { validate } from "../dist/profile/validate.js";
import { bindSupports, proposeSupportBindings } from "../dist/profile/supports.js";
import { remapIds } from "../dist/profile/remap.js";
import { sortPlacementRecords } from "../dist/profile/normalize.js";
import { stableId } from "../dist/profile/canonical.js";
import { importProjection } from "../dist/profile/import.js";
import { runTxScriptOnCanvas } from "./helpers/l3-tx-canvas.mjs";

const dir = new URL("./fixtures/lot3-cn/expectations/cases/", import.meta.url);
const files = readdirSync(dir).filter(f => f.endsWith(".json")).sort();
const compiledCache = new Map();

async function compiledFor(profileArtifact) {
  if (!compiledCache.has(profileArtifact.path)) {
    const profileBytes = readFileSync(new URL(`../../../${profileArtifact.path}`, dir));
    assert.equal(rawDigest(profileBytes), profileArtifact.sha256, `profile bytes for ${profileArtifact.path}`);
    compiledCache.set(profileArtifact.path, await compileByPath(profileArtifact.path));
  }
  return compiledCache.get(profileArtifact.path);
}

const input = (vector, role) => vector.inputArtifacts.find(a => a.role === role)?.json;

const parityManifest = JSON.parse(readFileSync(new URL("./fixtures/lot3-cn/expectations/vendor/py/parity/manifest.json", import.meta.url)));
const variantBySha = new Map(parityManifest.profiles.map(row => [row.sha256, row.variant]));
const parityVariant = ref => variantBySha.get(ref.sha256)
  ?? ref.path.split("/").pop().replace(/\.json$/, "").replace(/-profile$/, "").replace(/^neutral-/, "");

async function runOperation(vector, compiled) {
  const envelope = input(vector, "envelope");
  switch (vector.operation) {
    case "planRecipe": {
      const plan = await planRecipe(compiled, envelope, input(vector, "recipe"), input(vector, "params"), input(vector, "authority"));
      const apply = plan.status === "ok" ? await applyPlan(plan.payload, envelope.tree, envelope) : plan;
      return { plan, apply, "caller-state": envelope };
    }
    case "applyPlan": {
      const stagedEnvelope = input(vector, "stagedEnvelope") ?? envelope;
      const stagedTree = input(vector, "stagedTree") ?? stagedEnvelope.tree;
      const apply = await applyPlan(input(vector, "plan"), stagedTree, stagedEnvelope);
      return { apply, "caller-state": envelope ?? stagedEnvelope };
    }
    case "complete": {
      const result = await complete(compiled, envelope, input(vector, "mode"), input(vector, "activation"));
      const actual = { result, "caller-state": envelope };
      if (vector.comparatorIds.includes("fixed-point/lot3") && result.status === "ok") {
        actual["fixed-point"] = await complete(compiled, result.payload, input(vector, "mode"), input(vector, "activation"));
      }
      return actual;
    }
    case "validate": {
      const result = validate(compiled, envelope, input(vector, "options"));
      return { result, "caller-state": envelope };
    }
    case "bindSupports": {
      const result = await bindSupports(compiled, envelope, input(vector, "bindings"), input(vector, "activation"));
      return { result, "caller-state": envelope };
    }
    case "proposeSupportBindings": {
      const result = await proposeSupportBindings(compiled, envelope, input(vector, "provenance"));
      return { result, "caller-state": envelope };
    }
    case "remapIds": {
      const importedDi = input(vector, "importedDi");
      const result = await remapIds(compiled, envelope, importedDi, vector.commandArtifact?.json, input(vector, "activation"));
      // Caller-state echoes the consumed inputs. Twin-authored vectors echo
      // the envelope; JS-authored remap vectors echo envelope plus diagrams.
      const callerState = vector.caseId.startsWith("cn-") ? envelope : { envelope, importedDi };
      return { result, "caller-state": callerState };
    }
    case "sortPlacements": {
      return { placements: sortPlacementRecords(input(vector, "placements")) };
    }
    case "stable-id/1": {
      const ids = input(vector, "allocations").map(allocation => stableId(allocation.owner, allocation.slot, allocation.key));
      return { ids };
    }
    case "compileProfile": {
      // Single-profile vectors compile their profile artifact; the variants
      // vector compiles each profile input. Variant names join the parity
      // manifest on bytes sha, falling back to the file stem.
      const refs = vector.profileArtifact
        ? [vector.profileArtifact]
        : vector.inputArtifacts.filter(a => a.role === "profile").map(a => a.json);
      const compile = [], identities = [];
      for (const ref of refs) {
        const { compiled } = await compileByPath(ref.path);
        const result = compiled ?? { status: "refused", code: "operation-error", diagnostics: [] };
        compile.push(result);
        if (result.status === "ok") {
          identities.push({ identity: result.payload.identity,
            variant: parityVariant(ref) });
        }
      }
      const actual = { compile: vector.profileArtifact ? compile[0] : compile };
      if (vector.profileArtifact) actual["compiled-identity"] = identities[0]?.identity;
      else actual["compiled-identities"] = identities;
      return actual;
    }
    case "importProjection": {
      const sourceArtifact = vector.inputArtifacts.find(a => a.role === "source");
      const source = sourceArtifact?.text ?? sourceArtifact?.json;
      const result = await importProjection(compiled, source, input(vector, "source-format"));
      // Caller-state echoes the source bytes.
      return { result, "caller-state": source };
    }
    case "normalize": {
      // Mixed-runtime transport: the route plans which runtime executes each
      // hop; every hop runs the same deterministic normalize locally and the
      // sealed twin bytes verify the parity hop by hop.
      const route = input(vector, "transport-route");
      if (route) {
        const hops = [];
        let current = envelope;
        for (let i = 0; i < route.route.length; i++) {
          const result = await normalize(compiled, current, route.activations[i], undefined);
          const bytes = result.status === "ok" ? canonicalize(result.payload.envelope) : canonicalize(result);
          hops.push({ hop: i + 1, runtime: route.route[i], activation: route.activations[i],
            input: i === 0 ? "envelope" : `hop-${i}-transport-bytes`, outputSha256: rawDigest(bytes), bytes, result });
          current = JSON.parse(bytes);
          if (result.status === "ok") current = result.payload.envelope;
        }
        return { transport: { route: route.route, hops }, "caller-state": envelope };
      }
      const result = await normalize(compiled, envelope, input(vector, "activation"), input(vector, "placement-intent"));
      const actual = { result, "caller-state": envelope };
      if (vector.comparatorIds.includes("fixed-point/lot3") && result.status === "ok") {
        actual["fixed-point"] = await normalize(compiled, result.payload.envelope, input(vector, "activation"), input(vector, "placement-intent"));
      }
      return actual;
    }
    case "transaction-script": {
      // Lot-5 canvas adapter (tests/helpers/l3-tx-canvas.mjs): replays the
      // sealed script on the real canvas, resolving $refs (including inject)
      // against prior trace records. The native modeling command during
      // applying stays a strict expected-skip (OPEN-HOOK, U1).
      const sessionInput = input(vector, "session");
      const trace = await runTxScriptOnCanvas({ compiled, sessionInput,
        steps: vector.commandArtifact.json.steps, dir });
      return { trace };
    }
    default:
      throw new Error(`unsupported operation ${vector.operation}`);
  }
}

for (const file of files) {
  const vector = JSON.parse(readFileSync(new URL(file, dir)));
  test(vector.caseId, async () => {
    // Profile-free pure ops (sort, stable-id) carry no profile artifact.
    const { loaded, compiled } = vector.profileArtifact
      ? await compiledFor(vector.profileArtifact)
      : { loaded: { status: "ok" }, compiled: { status: "ok", payload: null } };
    assert.equal(loaded.status, "ok", loaded.code);
    // compileProfile vectors recompile their own inputs in the branch below;
    // refusal vectors expect that compile to fail, so the outer compile is
    // only required input for the other operations.
    if (vector.operation !== "compileProfile") assert.equal(compiled.status, "ok", compiled.code);
    const actual = await runOperation(vector, compiled.payload);
    const { ok, failures } = compareCase(vector, actual);
    assert.ok(ok, `${vector.caseId}: ${failures.join(" | ")}`);
  });
}
