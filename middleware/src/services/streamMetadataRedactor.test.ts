import { describe, expect, it } from "vitest";

import { classifyFenceBody, makeMetadataStreamRedactor } from "./streamMetadataRedactor.js";

/**
 * chat-response-streaming / citation-stream-leak — the grounded model appends a
 * trailing ```json {"citations":[...]} metadata block (fragments.ts
 * citationsContract). The streamed `token` frames are RAW model text, but
 * parseGroundedAnswer only strips that block from the FINAL answer — so mid-
 * stream the raw JSON (incl. the internal GroundX documentId) briefly flashes on
 * screen. This redactor sits on the token seam so the metadata block never
 * reaches the UI (and never crosses the wire). Because the final envelope
 * REPLACES the streamed draft, over-holding is free — the redactor only needs to
 * guarantee it NEVER emits any part of the metadata block.
 */

// Feed a full answer to the redactor split into arbitrary chunks; return the
// concatenation of what it would stream to the UI.
function runChunks(full: string, chunkSize: number): string {
  const redact = makeMetadataStreamRedactor();
  let out = "";
  for (let i = 0; i < full.length; i += chunkSize) {
    out += redact(full.slice(i, i + chunkSize));
  }
  return out;
}

describe("makeMetadataStreamRedactor", () => {
  const FENCED =
    "The total due is $7,613.20.[1]\n\n```json\n" +
    '{"citations":[{"documentId":"c3bfff49-6640-4213","field":"balance_payable","value":7613.2}]}\n' +
    "```";
  const BARE =
    "This bill has 8 meters.[1] Usage is 60,960 kWh.[2]\n\n" +
    '{"citations":[{"documentId":"c3bfff49","field":"meters","value":"[{\\"meter_id\\":\\"70182657\\"}]"}]}';

  it("emits the prose but never any part of a FENCED citations block, at every chunk size", () => {
    for (const size of [1, 3, 7, 20, 500]) {
      const out = runChunks(FENCED, size);
      expect(out).not.toMatch(/citations/);
      expect(out).not.toContain("```");
      expect(out).not.toContain("documentId");
      // the prose (including its inline marker) survives
      expect(out).toContain("The total due is $7,613.20.[1]");
    }
  });

  it("emits the prose but never any part of a BARE (fence-dropped) citations object", () => {
    for (const size of [1, 4, 13, 200]) {
      const out = runChunks(BARE, size);
      expect(out).not.toMatch(/citations|documentId|meter_id/);
      expect(out).toContain("This bill has 8 meters.[1] Usage is 60,960 kWh.[2]");
    }
  });

  it("passes plain prose through unchanged (no metadata block)", () => {
    const prose = "GroundX is a document intelligence platform. It parses tables with X-Ray. That's it.";
    // A stream that ends WITH trailing prose flushes fully.
    expect(runChunks(prose + " ", 5).trimEnd()).toBe(prose);
  });

  it("does not hold back prose that merely contains braces once more text follows", () => {
    const prose = "The reading set is {a, b, c} for this meter, and the totals follow after that clause.";
    expect(runChunks(prose, 6)).toBe(prose);
  });

  it("does not leak a ```json fence even with a verbose whitespace gap before the key (adversarial CASE1)", () => {
    // The fence is caught on its own, so a large gap before "citations" (which
    // would otherwise scroll the fence past the holdback) cannot leak it.
    const full = "The answer.[1]\n\n```json" + " ".repeat(40) + '\n{"citations":[{"documentId":"D"}]}\n```';
    for (const size of [1, 5, 100]) {
      const out = runChunks(full, size);
      expect(out).not.toContain("```");
      expect(out).not.toMatch(/citations|documentId/);
      expect(out).toContain("The answer.[1]");
    }
  });

  it("STREAMS an ordinary ```json code block (first key is NOT citations) instead of suppressing it", () => {
    const full =
      "Here's the extraction payload shape:\n\n```json\n" +
      '{"amount": 55, "unit": "kWh", "citations_note": "n/a"}\n' +
      "```\n\nThat's what GroundX returns.";
    for (const size of [1, 4, 20, 500]) {
      const out = runChunks(full, size);
      // The whole content block survives — fence, body, and the trailing prose.
      expect(out).toContain("```json");
      expect(out).toContain('"amount": 55');
      expect(out).toContain('"unit": "kWh"');
      expect(out).toContain("That's what GroundX returns.");
    }
  });

  it("streams a content block AND still suppresses a later citations metadata block in the same answer", () => {
    const full =
      "Example:\n```json\n{\"amount\":55}\n```\nThe total is $55.[1]\n\n" +
      '```json\n{"citations":[{"documentId":"D","field":"line_amount","value":55}]}\n```';
    for (const size of [1, 3, 40]) {
      const out = runChunks(full, size);
      expect(out).toContain('{"amount":55}'); // content block streamed
      expect(out).toContain("The total is $55.[1]"); // prose between blocks streamed
      expect(out).not.toMatch(/citations|documentId/); // trailing metadata suppressed
      expect(out.match(/```json/g)?.length).toBe(1); // only the CONTENT fence survives
    }
  });

  it("never emits a partial fence when the marker is split across deltas", () => {
    // Simulate the exact split that leaks without a holdback: backticks in one
    // delta, the rest of the marker in the next.
    const redact = makeMetadataStreamRedactor();
    let out = "";
    out += redact("Answer here.[1] ");
    out += redact("``");
    out += redact("`json\n{\"citations\":[]}\n```");
    expect(out).not.toContain("`");
    expect(out).toContain("Answer here.[1]");
  });
});

describe("classifyFenceBody", () => {
  it("is metadata when the first key is a metadata key (any leading whitespace)", () => {
    expect(classifyFenceBody('{"citations":[]}')).toBe("metadata");
    expect(classifyFenceBody('\n  { "citations" : [')).toBe("metadata");
    expect(classifyFenceBody('{"suggestedIntent":{}}')).toBe("metadata");
  });
  it("is content for a non-citations object, an array, or a scalar", () => {
    expect(classifyFenceBody('{"amount": 55}')).toBe("content");
    expect(classifyFenceBody("[1,2,3]")).toBe("content");
    expect(classifyFenceBody('"just a string"')).toBe("content");
    expect(classifyFenceBody("{}")).toBe("content");
  });
  it("stays undecided while the opening (or a still-viable key prefix) streams", () => {
    expect(classifyFenceBody("")).toBe("undecided");
    expect(classifyFenceBody("\n  ")).toBe("undecided");
    expect(classifyFenceBody("{")).toBe("undecided");
    expect(classifyFenceBody('{"cit')).toBe("undecided"); // could still become "citations"
  });
  it("flips to content as soon as the first key diverges from every metadata key", () => {
    expect(classifyFenceBody('{"cix')).toBe("content"); // "cix" is no metadata-key prefix
    expect(classifyFenceBody('{"amo')).toBe("content");
  });
});
