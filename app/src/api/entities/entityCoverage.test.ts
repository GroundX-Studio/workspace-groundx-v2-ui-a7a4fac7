import { describe, expect, it } from "vitest";

import * as customer from "./customerEntity";
import * as groundxApiKeys from "./groundxApiKeysEntity";
import * as groundxBuckets from "./groundxBucketsEntity";
import * as groundxCustomer from "./groundxCustomerEntity";
import * as groundxDocuments from "./groundxDocumentsEntity";
import * as groundxGroups from "./groundxGroupsEntity";
import * as groundxHealth from "./groundxHealthEntity";
import * as groundxSearch from "./groundxSearchEntity";
import * as groundxWorkflows from "./groundxWorkflowsEntity";
import * as partnerApiKeys from "./partnerApiKeysEntity";
import * as partnerBuckets from "./partnerBucketsEntity";
import * as partnerCustomer from "./partnerCustomerEntity";
import * as partnerGroups from "./partnerGroupsEntity";
import * as partnerProjects from "./partnerProjectsEntity";

const expectedExports: Record<string, { module: Record<string, unknown>; exports: string[] }> = {
  customer: {
    module: customer,
    exports: [
      "confirmUserChangingPassword",
      "getUserData",
      "login",
      "logout",
      "register",
      "resetUserPassword",
      "updateAppMetadata",
    ],
  },
  groundxApiKeys: {
    module: groundxApiKeys,
    exports: ["createGroundXApiKey", "deleteGroundXApiKey", "listGroundXApiKeys", "renameGroundXApiKey"],
  },
  groundxBuckets: {
    module: groundxBuckets,
    exports: ["createGroundXBucket", "deleteGroundXBucket", "getGroundXBucket", "listGroundXBuckets", "updateGroundXBucket"],
  },
  groundxCustomer: {
    module: groundxCustomer,
    exports: ["getGroundXCustomer"],
  },
  groundxDocuments: {
    module: groundxDocuments,
    exports: [
      "cancelGroundXProcess",
      "copyGroundXDocuments",
      "crawlGroundXWebsite",
      "deleteGroundXDocument",
      "deleteGroundXDocuments",
      "getGroundXDocument",
      "getGroundXDocumentExtract",
      "getGroundXDocumentXray",
      "getGroundXProcessingStatus",
      "ingestGroundXLocalDocument",
      "ingestGroundXRemoteDocuments",
      "listGroundXDocuments",
      "listGroundXProcesses",
      "lookupGroundXDocument",
      "updateGroundXDocuments",
    ],
  },
  groundxGroups: {
    module: groundxGroups,
    exports: [
      "addBucketToGroundXGroup",
      "createGroundXGroup",
      "deleteGroundXGroup",
      "getGroundXGroup",
      "listGroundXGroups",
      "removeBucketFromGroundXGroup",
      "updateGroundXGroup",
    ],
  },
  groundxHealth: {
    module: groundxHealth,
    exports: ["getGroundXServiceHealth", "listGroundXHealth"],
  },
  groundxSearch: {
    module: groundxSearch,
    exports: ["searchGroundXContent", "searchGroundXDocuments"],
  },
  groundxWorkflows: {
    module: groundxWorkflows,
    exports: [
      "assignGroundXAccountWorkflow",
      "assignGroundXWorkflowToResource",
      "createGroundXWorkflow",
      "deleteGroundXWorkflow",
      "getGroundXAccountWorkflow",
      "getGroundXWorkflow",
      "listGroundXWorkflows",
      "removeGroundXAccountWorkflow",
      "removeGroundXWorkflowFromResource",
      "updateGroundXWorkflow",
    ],
  },
  partnerApiKeys: {
    module: partnerApiKeys,
    exports: ["createPartnerApiKey", "deletePartnerApiKey", "listPartnerApiKeys", "renamePartnerApiKey"],
  },
  partnerBuckets: {
    module: partnerBuckets,
    exports: [
      "createPartnerBucket",
      "deletePartnerBucket",
      "getPartnerBucket",
      "listPartnerBuckets",
      "transferPartnerBucket",
      "updatePartnerBucket",
    ],
  },
  partnerCustomer: {
    module: partnerCustomer,
    exports: [
      "confirmPartnerCustomerPassword",
      "deletePartnerCustomer",
      "getPartnerCustomer",
      "loginPartnerCustomer",
      "registerPartnerCustomer",
      "resetPartnerCustomerPassword",
    ],
  },
  partnerGroups: {
    module: partnerGroups,
    exports: ["createPartnerGroup", "deletePartnerGroup", "getPartnerGroup", "listPartnerGroups", "updatePartnerGroup"],
  },
  partnerProjects: {
    module: partnerProjects,
    exports: [
      "attachBucketToPartnerProject",
      "createPartnerProject",
      "detachBucketFromPartnerProject",
      "listPartnerProjects",
      "updatePartnerProject",
    ],
  },
};

describe("SDK entity export coverage", () => {
  it.each(Object.entries(expectedExports))("%s exports only documented runtime functions", (_name, entry) => {
    expect(Object.keys(entry.module).sort()).toEqual(entry.exports.sort());
  });
});
