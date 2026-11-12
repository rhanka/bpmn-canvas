// Caller-owned native test input, supplied explicitly at every codec boundary.
import { readFileSync, readdirSync } from "node:fs";
const root = new URL("../fixtures/io/reference/", import.meta.url);
const candidates = readdirSync(root).filter(name => name.endsWith(".json")).map(name => JSON.parse(readFileSync(new URL(name, root)))).filter(value => value.uri && Array.isArray(value.types));
if (candidates.length !== 1) throw new Error("Ambiguous fixture descriptor");
export const fixtureDescriptor = candidates[0];
