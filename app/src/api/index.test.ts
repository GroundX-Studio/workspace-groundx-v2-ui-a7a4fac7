import { describe, expect, it } from "vitest";

import { api } from "./index";

describe("SDK API barrel", () => {
  it("exports namespaced Partner and GroundX API families plus legacy auth helpers", () => {
    expect(api).toEqual(
      expect.objectContaining({
        partnerCustomer: expect.any(Object),
        partnerApiKeys: expect.any(Object),
        partnerBuckets: expect.any(Object),
        partnerGroups: expect.any(Object),
        partnerProjects: expect.any(Object),
        groundxApiKeys: expect.any(Object),
        groundxBuckets: expect.any(Object),
        groundxCustomer: expect.any(Object),
        groundxDocuments: expect.any(Object),
        groundxGroups: expect.any(Object),
        groundxHealth: expect.any(Object),
        groundxSearch: expect.any(Object),
        groundxWorkflows: expect.any(Object),
        login: expect.any(Function),
        register: expect.any(Function),
        getUserData: expect.any(Function),
        updateAppMetadata: expect.any(Function),
        resetUserPassword: expect.any(Function),
        confirmUserChangingPassword: expect.any(Function),
      })
    );
  });

  it("keeps ambiguous resources grouped by API family", () => {
    expect(api.groundxBuckets.listGroundXBuckets).toEqual(expect.any(Function));
    expect(api.partnerBuckets.listPartnerBuckets).toEqual(expect.any(Function));
    expect((api as Record<string, unknown>).listBuckets).toBeUndefined();
    expect((api as Record<string, unknown>).getBucket).toBeUndefined();
  });
});
