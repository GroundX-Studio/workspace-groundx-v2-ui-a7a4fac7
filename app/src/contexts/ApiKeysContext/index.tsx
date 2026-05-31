import { createContextHook } from "@/contexts/createEntityContext";

import { ApiKeysContext, ApiKeysContextI } from "./ApiKeysContext";
export { ApiKeysProvider } from "./ApiKeysProvider";

export const useApiKeysContext = createContextHook(ApiKeysContext, "useApiKeysContext must be used inside an ApiKeysProvider");
