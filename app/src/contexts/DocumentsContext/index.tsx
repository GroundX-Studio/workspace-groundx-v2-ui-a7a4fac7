import { createContextHook } from "@/contexts/createEntityContext";

import { DocumentsContext } from "./DocumentsContext";
export { DocumentsProvider } from "./DocumentsProvider";

export const useDocumentsContext = createContextHook(DocumentsContext, "useDocumentsContext must be used inside a DocumentsProvider");
