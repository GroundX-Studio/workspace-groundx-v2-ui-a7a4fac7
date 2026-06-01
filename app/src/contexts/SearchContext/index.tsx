import { createContextHook } from "@/contexts/createEntityContext";

import { SearchContext } from "./SearchContext";
export { SearchProvider } from "./SearchProvider";

export const useSearchContext = createContextHook(SearchContext, "useSearchContext must be used inside a SearchProvider");
