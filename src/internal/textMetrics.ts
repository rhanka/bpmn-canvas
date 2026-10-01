// Text measurement for the layout: Helvetica and Helvetica-Bold advance widths
// (1/1000 em) for ASCII 32..126, the metrics of the Helvetica/Arial default font.
// A fixed table makes the size the layout reserves independent of the fonts
// installed on the machine, which canvas measureText would not guarantee.
//
// MODIFIED EXTRACTION. The two 95-entry tables below are an ASCII-only extraction
// of Adobe's PostScript AFM font metrics for Helvetica and Helvetica-Bold, as
// redistributed in the Matplotlib v3.10.7 `pdfcorefonts` directory. Only the
// character widths for the Unicode code points 32..126 are kept; everything else
// in the AFM files is omitted. The Unicode apostrophe (39) and grave accent (96)
// take the widths of the glyphs `quotesingle` and `grave` (regular 191 / 333,
// bold 238 / 333), not those of the numeric PostScript codes that occupy the same
// positions in the AFM encoding. No Helvetica outline or font binary is included.
//
// Adobe notices, kept as required:
//   Comment Copyright (c) 1985, 1987, 1989, 1990, 1997 Adobe Systems Incorporated.  All Rights Reserved.
//   Notice Copyright (c) 1985, 1987, 1989, 1990, 1997 Adobe Systems Incorporated.  All Rights Reserved.
//   Helvetica is a trademark of Linotype-Hell AG and/or its subsidiaries.
//
// Terms: Adobe's permission paragraph in licenses/Adobe-AFM-readme.txt and the
// notices in licenses/Adobe-AFM-copyright.txt travel with this data. They are
// Adobe's terms; this data is not covered by the MIT license of this package.

const REGULAR =
  "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 " +
  "278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 " +
  "611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 " +
  "556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584";
const BOLD =
  "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 " +
  "333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 " +
  "611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 " +
  "611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584";

/** Advance widths in 1/1000 em for ASCII 32..126, index 0 = space. */
export const HELVETICA_WIDTHS: { readonly regular: readonly number[]; readonly bold: readonly number[] } = {
  regular: REGULAR.split(" ").map(Number),
  bold: BOLD.split(" ").map(Number),
};

const FALLBACK_WIDTH = 556;

function charWidth(ch: string, size: number, bold: boolean): number {
  let code = ch.charCodeAt(0);
  if (code < 32 || code > 126) {
    const base = ch.normalize("NFD").charCodeAt(0);
    code = base >= 32 && base <= 126 ? base : -1;
  }
  const table = bold ? HELVETICA_WIDTHS.bold : HELVETICA_WIDTHS.regular;
  const w = code >= 32 ? (table[code - 32] ?? FALLBACK_WIDTH) : FALLBACK_WIDTH;
  return (w * size) / 1000;
}

export function textWidth(text: string, size: number, bold = false): number {
  let sum = 0;
  for (const ch of text ?? "") sum += charWidth(ch, size, bold);
  return sum;
}

/** Greedy word wrap; a word wider than maxWidth is broken by characters. */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of (text ?? "").split("\n")) {
    let cur = "";
    for (let word of para.split(/\s+/).filter(Boolean)) {
      const cand = cur ? `${cur} ${word}` : word;
      if (textWidth(cand, size, bold) <= maxWidth) {
        cur = cand;
        continue;
      }
      if (cur) lines.push(cur);
      cur = "";
      while (textWidth(word, size, bold) > maxWidth && word.length > 1) {
        let cut = word.length;
        while (cut > 1 && textWidth(word.slice(0, cut), size, bold) > maxWidth) cut -= 1;
        lines.push(word.slice(0, cut));
        word = word.slice(cut);
      }
      cur = word;
    }
    lines.push(cur);
  }
  return lines.length ? lines : [""];
}
