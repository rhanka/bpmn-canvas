// x24 derivation helper: applies the hand-audited classification rules to single occurrences. Pure data code.

export function compileRules(document) {
  return document.rules.map((rule) => ({
    rule,
    path: new RegExp(rule.path),
    families: rule.families ? new Set(rule.families) : null,
    entries: rule.entries ? new Set(rule.entries) : null,
    lines: rule.lines ? new Set(rule.lines) : null,
    keys: rule.keys ? new Set(rule.keys) : null,
    forms: rule.forms ? new Set(rule.forms) : null,
  }));
}

/** First rule matching one occurrence of the file with masked path `file`, or null. */
export function classify(compiled, file, occurrence) {
  for (const c of compiled) {
    if (!c.path.test(file)) continue;
    if (c.rule.kind === "path" && occurrence.line !== 0) continue;
    if (c.rule.kind === "content" && occurrence.line === 0) continue;
    if (c.families && !c.families.has(occurrence.family)) continue;
    if (c.entries && !c.entries.has(occurrence.entry)) continue;
    if (c.lines && !c.lines.has(occurrence.line)) continue;
    if (c.keys && !c.keys.has(occurrence.key)) continue;
    if (c.forms && !c.forms.has(occurrence.form)) continue;
    return c.rule;
  }
  return null;
}
