import { useContext } from "react";

import { DocumentsContext, DocumentsContextI } from "./DocumentsContext";
export { DocumentsProvider } from "./DocumentsProvider";

export const useDocumentsContext = (): DocumentsContextI => {
  const context = useContext(DocumentsContext);
  if (!context) throw new Error("useDocumentsContext must be used inside a DocumentsProvider");
  return context;
};

