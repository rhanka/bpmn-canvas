// Compact test evidence: names and scalar failures only, without source paths.
export default async function* (events) {
  for await (const event of events) {
    if (event.type === "test:pass") yield `PASS ${event.data.name}\n`;
    if (event.type === "test:fail") {
      const e = event.data.details.error?.cause ?? event.data.details.error;
      const scalar = value => ["string", "number", "boolean"].includes(typeof value) ? value : typeof value;
      yield `FAIL ${event.data.name}: ${e?.code ?? "error"}; actual=${scalar(e?.actual)} expected=${scalar(e?.expected)}\n`;
    }
    if (event.type === "test:summary") yield `SUMMARY ${event.data.file?.split(/[\\/]/).pop() ?? "ALL"} ${JSON.stringify(event.data.counts)}\n`;
  }
}
