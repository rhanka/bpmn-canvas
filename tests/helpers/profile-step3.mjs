import { readFileSync } from "node:fs";
import { verifyCorpus, verifyExpectations, verifyFreeze } from "./profile-seal.mjs";

verifyCorpus();
verifyFreeze();
export const expectations = verifyExpectations().vectors;
export const vendor = new URL("../fixtures/profile-parity-corpus/", import.meta.url);
export const readJson = path => JSON.parse(readFileSync(new URL(path, vendor), "utf8"));
export const readCase = vector => vector.canonicalPath ? readJson(vector.canonicalPath) : vector;
export const artifact = (vector, role) => vector.inputArtifacts.find(item => item.role === role);
export const schemaPath = "profile-mechanism/1/profile-mechanism-1.schema.json";
