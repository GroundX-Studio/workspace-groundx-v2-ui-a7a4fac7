import { createContext } from "react";

import { GroundXRequestOptions, PaginationParams } from "@/api/common";
import {
  CopyDocumentsInput,
  CrawlWebsiteInput,
  DeleteDocumentsInput,
  IngestDocumentsInput,
  UpdateDocumentsInput,
} from "@/api/entities/groundxDocumentsEntity";
import { GroundXDocument, IngestProcess } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface DocumentsContextI {
  documents: GroundXDocument[];
  selectedDocument: GroundXDocument | null;
  processes: IngestProcess[];
  listDocuments: (params?: PaginationParams, options?: GroundXRequestOptions) => Promise<SdkActionResult<GroundXDocument[]>>;
  ingestRemoteDocuments: (input: IngestDocumentsInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  crawlWebsite: (input: CrawlWebsiteInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  copyDocuments: (input: CopyDocumentsInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  updateDocuments: (input: UpdateDocumentsInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  deleteDocuments: (input: DeleteDocumentsInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  getDocument: (documentId: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<GroundXDocument>>;
  lookupDocument: (id: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<GroundXDocument>>;
  deleteDocument: (documentId: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  getProcessingStatus: (processId: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  cancelProcess: (processId: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  listProcesses: (options?: GroundXRequestOptions) => Promise<SdkActionResult<IngestProcess[]>>;
}

export const DocumentsContext = createContext<DocumentsContextI | undefined>(undefined);

