// x24 derivation helper: Source Map v3 "mappings" decoder (Base64 VLQ), pure arithmetic.
// Used only to attribute a distribution-bundle match to the source file named by the map.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const VALUE = new Map([...B64].map((c, i) => [c, i]));

function decodeSegment(text) {
  const out = [];
  let shift = 0;
  let value = 0;
  for (const c of text) {
    const digit = VALUE.get(c);
    if (digit === undefined) throw new Error(`invalid VLQ digit ${JSON.stringify(c)}`);
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      shift = 0;
      value = 0;
    }
  }
  if (shift !== 0) throw new Error("truncated VLQ segment");
  return out;
}

/** Decoded map: per generated line (0-based) an array of [generatedColumn, sourceIndex]. */
export function decodeMap(map) {
  if (map.version !== 3 || typeof map.mappings !== "string" || !Array.isArray(map.sources)) throw new Error("unsupported source map");
  const lines = [];
  let source = 0;
  for (const groupText of map.mappings.split(";")) {
    const group = [];
    let column = 0;
    if (groupText) {
      for (const segmentText of groupText.split(",")) {
        const segment = decodeSegment(segmentText);
        column += segment[0];
        if (segment.length >= 4) {
          source += segment[1];
          group.push([column, source]);
        }
      }
    }
    lines.push(group);
  }
  return { sources: map.sources, lines };
}

/** Source path covering a 1-based generated line and 0-based column, or null when unmapped. */
export function sourceAt(decoded, line, column) {
  const group = decoded.lines[line - 1];
  if (!group || !group.length) return null;
  let lo = 0;
  let hi = group.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (group[mid][0] <= column) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? null : decoded.sources[group[found][1]];
}
