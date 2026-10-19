import type { BusinessPolicy } from "./business-policy.js";
import { ProfileContractError } from "../profile/canonical.js";

/** Measure code points with the caller's table and explicit aliases. */
export function textWidth(text: string, size: number, bold = false, policy?: BusinessPolicy): number {
  const metrics = policy?.metrics;
  if (!metrics) throw new ProfileContractError("profile-resource-missing");
  const table = bold ? metrics.bold : metrics.regular;
  let sum = 0;
  for (const point of text ?? "") {
    const alias = metrics.aliases.find(a => a.from === point);
    const code = (alias?.to ?? point).codePointAt(0)!;
    const index = code - metrics.firstCodePoint;
    const width = index >= 0 && index < table.length ? table[index]! : metrics.fallback;
    sum += width * size / 1000;
  }
  return sum;
}

/** Greedy word wrap; a word wider than maxWidth is broken by characters. */
export function wrapText(text: string, size: number, maxWidth: number, bold = false, policy?: BusinessPolicy): string[] {
  const lines: string[] = [];
  for (const para of (text ?? "").split("\n")) {
    let cur = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      const cand = cur ? `${cur} ${word}` : word;
      if (textWidth(cand, size, bold, policy) <= maxWidth) {
        cur = cand;
        continue;
      }
      if (cur) lines.push(cur);
      cur = "";
      while (textWidth(word, size, bold, policy) > maxWidth && word.length > 1) {
        let cut = word.length;
        while (cut > 1 && textWidth(word.slice(0, cut), size, bold, policy) > maxWidth) cut -= 1;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      cur = word;
    }
    lines.push(cur);
  }
  return lines.length ? lines : [""];
}
