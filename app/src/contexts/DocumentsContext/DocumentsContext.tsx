import { createContext } from "react";

import { GroundXRequestOptions, PaginationParams } from "@/api/common";
import {
  CopyDocumentsInput,
  CrawlWebsiteInput,
  DeleteDocumentsInput,
  DocumentExtractResponse,
  DocumentXrayResponse,
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
  /**
   * Fetch the xray (parsed pages + bounding boxes + binary URL) for
   * a document. Used by the PdfViewer widget. The widget caches its
   * own result; this method just exposes the call.
   */
  getDocumentXray: (documentId: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<DocumentXrayResponse>>;
  /**
   * Fetch the raw extraction values for a document. Schema metadata
   * (labels/descriptions/types) lives in the workflow, NOT in this
   * response; the Extract widget combines this with the workflow.
   */
  getDocumentExtract: (documentId: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<DocumentExtractResponse>>;
  getProcessingStatus: (processId: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  cancelProcess: (processId: string, options?: GroundXRequestOptions) => Promise<SdkActionResult<void>>;
  listProcesses: (options?: GroundXRequestOptions) => Promise<SdkActionResult<IngestProcess[]>>;
}

export const DocumentsContext = createContext<DocumentsContextI | undefined>(undefined);

