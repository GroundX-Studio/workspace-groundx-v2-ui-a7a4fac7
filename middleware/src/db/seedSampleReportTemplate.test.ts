import { describe, expect, it } from "vitest";

import { SAMPLE_REPORT_TEMPLATE_ID } from "@groundx/shared";

import { reportTemplateFromRecord } from "../services/reportRenderer.js";
import { MemoryAppRepository } from "./memoryRepository.js";
import { SAMPLE_TEMPLATE_OWNER, seedSampleReportTemplate } from "./seedSampleProject.js";

describe("seedSampleReportTemplate (report-default-template T3)", () => {
  it("upserts ONE report-kind template under the shared id + sentinel owner, with the T1-verified sections", async () => {
    const repo = new MemoryAppRepository();
    await seedSampleReportTemplate(repo);

    const record = await repo.getTemplate(SAMPLE_REPORT_TEMPLATE_ID);
    expect(record).not.toBeNull();
    expect(record!.kind).toBe("report");
    // Owner is the reserved sentinel (NOT null — groundx_username is NOT NULL).
    expect(record!.groundxUsername).toBe(SAMPLE_TEMPLATE_OWNER);

    // The body round-trips through the SERVER serialization (so the render path
    // reads the real authored questions), with exactly the three T1-verified
    // sections — account_activity dropped (ungroundable).
    const template = reportTemplateFromRecord(record!);
    expect(template).not.toBeNull();
    expect(template!.sections.map((s) => s.name)).toEqual([
      "billing_summary",
      "charges_by_service",
      "service_accounts",
    ]);
    // Each section carries a non-empty authored question (the prompt the live
    // render runs) — no placeholder/empty questions.
    for (const section of template!.sections) {
      expect(section.question.trim().length).toBeGreaterThan(0);
    }
  });

  it("is idempotent — re-running upserts the SAME single row (no duplicate id)", async () => {
    const repo = new MemoryAppRepository();
    await seedSampleReportTemplate(repo);
    await seedSampleReportTemplate(repo);
    const record = await repo.getTemplate(SAMPLE_REPORT_TEMPLATE_ID);
    expect(record).not.toBeNull();
    // listTemplates for the sentinel owner returns exactly one report template.
    const all = await repo.listTemplates(SAMPLE_TEMPLATE_OWNER, "report");
    expect(all.filter((t) => t.id === SAMPLE_REPORT_TEMPLATE_ID)).toHaveLength(1);
  });
});
