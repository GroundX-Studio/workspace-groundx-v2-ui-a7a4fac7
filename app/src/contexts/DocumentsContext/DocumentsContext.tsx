import { createContext } from "react";

import { RequestOptions, PaginationParams, Metadata } from "@/api/common";
import {
  CopyDocumentsInput,
  CrawlWebsiteInput,
  DeleteDocumentsInput,
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
  listDocuments: (params?: PaginationParams, options?: RequestOptions) => Promise<SdkActionResult<GroundXDocument[]>>;
  ingestRemoteDocuments: (input: IngestDocumentsInput, options?: RequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  crawlWebsite: (input: CrawlWebsiteInput, options?: RequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  copyDocuments: (input: CopyDocumentsInput, options?: RequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  updateDocuments: (input: UpdateDocumentsInput, options?: RequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  deleteDocuments: (input: DeleteDocumentsInput, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  getDocument: (documentId: string, options?: RequestOptions) => Promise<SdkActionResult<GroundXDocument>>;
  lookupDocument: (id: string, options?: RequestOptions) => Promise<SdkActionResult<GroundXDocument>>;
  deleteDocument: (documentId: string, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  /**
   * Fetch the xray (parsed pages + bounding boxes + binary URL) for
   * a document. Used by the PdfViewer widget. The widget caches its
   * own result; this method just exposes the call.
   */
  getDocumentXray: (documentId: string, options?: RequestOptions) => Promise<SdkActionResult<DocumentXrayResponse>>;
  /**
   * Fetch the raw extraction values for a document. Schema metadata
   * (labels/descriptions/types) lives in the workflow, NOT in this
   * response; the Extract widget combines this with the workflow.
   */
  getDocumentExtract: (documentId: string, options?: RequestOptions) => Promise<SdkActionResult<Metadata>>;
  getProcessingStatus: (processId: string, options?: RequestOptions) => Promise<SdkActionResult<IngestProcess>>;
  cancelProcess: (processId: string, options?: RequestOptions) => Promise<SdkActionResult<void>>;
  listProcesses: (options?: RequestOptions) => Promise<SdkActionResult<IngestProcess[]>>;
}

export const DocumentsContext = createContext<DocumentsContextI | undefined>(undefined);

