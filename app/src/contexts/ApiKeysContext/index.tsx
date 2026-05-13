import { useContext } from "react";

import { ApiKeysContext, ApiKeysContextI } from "./ApiKeysContext";
export { ApiKeysProvider } from "./ApiKeysProvider";

export const useApiKeysContext = (): ApiKeysContextI => {
  const context = useContext(ApiKeysContext);
  if (!context) throw new Error("useApiKeysContext must be used inside an ApiKeysProvider");
  return context;
};

