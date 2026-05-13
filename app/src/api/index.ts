import {
  confirmUserChangingPassword,
  getUserData,
  login,
  logout,
  register,
  resetUserPassword,
  updateAppMetadata,
} from "@/api/entities/customerEntity";
import * as groundxApiKeys from "@/api/entities/groundxApiKeysEntity";
import * as groundxBuckets from "@/api/entities/groundxBucketsEntity";
import * as groundxCustomer from "@/api/entities/groundxCustomerEntity";
import * as groundxDocuments from "@/api/entities/groundxDocumentsEntity";
import * as groundxGroups from "@/api/entities/groundxGroupsEntity";
import * as groundxHealth from "@/api/entities/groundxHealthEntity";
import * as groundxSearch from "@/api/entities/groundxSearchEntity";
import * as groundxWorkflows from "@/api/entities/groundxWorkflowsEntity";
import * as partnerApiKeys from "@/api/entities/partnerApiKeysEntity";
import * as partnerBuckets from "@/api/entities/partnerBucketsEntity";
import * as partnerCustomer from "@/api/entities/partnerCustomerEntity";
import * as partnerGroups from "@/api/entities/partnerGroupsEntity";
import * as partnerProjects from "@/api/entities/partnerProjectsEntity";

export const api = {
  partnerCustomer,
  partnerApiKeys,
  partnerBuckets,
  partnerGroups,
  partnerProjects,
  groundxApiKeys,
  groundxBuckets,
  groundxCustomer,
  groundxDocuments,
  groundxGroups,
  groundxHealth,
  groundxSearch,
  groundxWorkflows,
  login,
  register,
  logout,
  getUserData,
  updateAppMetadata,
  resetUserPassword,
  confirmUserChangingPassword,
};

export type * from "@/api/entities/sdkTypes";
