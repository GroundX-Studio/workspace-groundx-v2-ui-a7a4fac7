import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { GroundXRequestOptions } from "@/api/common";
import { SearchContentInput, SearchDocumentsInput } from "@/api/entities/groundxSearchEntity";
import { SearchResponseBody } from "@/api/entities/sdkTypes";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { createSdkResult } from "@/contexts/sdkContextTypes";

import { SearchContext } from "./SearchContext";

export const SearchProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage } = useMessageContext();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchResponseBody | null>(null);

  const runSearch = useCallback(
    async (work: () => Promise<SearchResponseBody>, nextQuery: string) => {
      const result = createSdkResult<SearchResponseBody>();
      setIsLoading(true);
      try {
        const response = await work();
        setQuery(nextQuery);
        setSearch(response);
        result.response = response;
        result.isSuccess = true;
      } catch (error) {
        result.error = error;
        setErrorMessage("Search failed.");
      } finally {
        setIsLoading(false);
      }
      return result;
    },
    [setErrorMessage, setIsLoading]
  );

  const searchContent = useCallback(
    (input: SearchContentInput, options?: GroundXRequestOptions) =>
      runSearch(async () => (await api.groundxSearch.searchGroundXContent(input, options)).search, input.query),
    [runSearch]
  );

  const searchDocuments = useCallback(
    (input: SearchDocumentsInput, options?: GroundXRequestOptions) =>
      runSearch(async () => (await api.groundxSearch.searchGroundXDocuments(input, options)).search, input.query),
    [runSearch]
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setSearch(null);
  }, []);

  return <SearchContext.Provider value={{ query, search, searchContent, searchDocuments, clearSearch }}>{children}</SearchContext.Provider>;
};

