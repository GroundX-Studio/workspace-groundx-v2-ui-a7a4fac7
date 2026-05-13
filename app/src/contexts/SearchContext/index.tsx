import { useContext } from "react";

import { SearchContext, SearchContextI } from "./SearchContext";
export { SearchProvider } from "./SearchProvider";

export const useSearchContext = (): SearchContextI => {
  const context = useContext(SearchContext);
  if (!context) throw new Error("useSearchContext must be used inside a SearchProvider");
  return context;
};

