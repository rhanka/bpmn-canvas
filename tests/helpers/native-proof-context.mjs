import { canonicalize, rawDigest } from "../../dist/profile/canonical.js";
import { createDescriptorContext } from "../../dist/profile/descriptor-context.js";

// Pin the effective descriptor metadata of the caller's native factory. No
// field or containment authority is inferred from document values.
export function nativeProofContext(factory) {
  const names = factory.getPackages().flatMap(pkg => pkg.types.filter(type => !type.extends?.length).map(type => `${pkg.prefix}:${type.name}`));
  const effective = new Map(names.map(name => [name, factory.getType(name).$descriptor]));
  const allowed = target => target === "Element" ? [...names, "$any"]
    : names.filter(name => effective.get(name).allTypes.some(type => type.name === target));
  const types = {};
  for (const [name, descriptor] of effective) {
    const scalars = [], containment = {}, references = {};
    for (const property of descriptor.properties) {
      if (property.isVirtual) continue;
      if (property.isReference) references[property.name] = allowed(property.type);
      else if (["String", "Boolean", "Integer", "Real"].includes(property.type) || !effective.has(property.type) && property.type !== "Element") scalars.push(property.name);
      else containment[property.name] = allowed(property.type);
    }
    scalars.push("$attrs");
    types[name] = { id: descriptor.properties.some(property => property.isId), scalars, containment, references };
  }
  types.$any = { id: false, scalars: ["$name", "$attrs", "$body"], containment: { $children: ["$any"] }, references: {} };
  const descriptorBytes = new TextEncoder().encode(canonicalize({ types }));
  const result = createDescriptorContext([{ id: "native-proof", version: "1", sha256: rawDigest(descriptorBytes), descriptorBytes }]);
  if (result.status !== "ok") throw new Error("proof context admission failed");
  return result.payload;
}
