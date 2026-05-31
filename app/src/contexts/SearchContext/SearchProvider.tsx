import { FC, ReactNode, useCallback, useState } from "react";

import { api } from "@/api";
import { RequestOptions } from "@/api/common";
import { SearchContentInput, SearchDocumentsInput } from "@/api/entities/groundxSearchEntity";
import { SearchResponseBody } from "@/api/entities/sdkTypes";
import { useSdkRunner } from "@/contexts/createEntityContext";

import { SearchContext } from "./SearchContext";

export const SearchProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const run = useSdkRunner("Search failed.");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<SearchResponseBody | null>(null);

  const runSearch = useCallback(
    (work: () => Promise<SearchResponseBody>, nextQuery: string) =>
      run(async () => {
        const response = await work();
        setQuery(nextQuery);
        setSearch(response);
        return response;
      }),
    [run]
  );

  const searchContent = useCallback(
    (input: SearchContentInput, options?: RequestOptions) =>
      runSearch(async () => (await api.groundxSearch.searchGroundXContent(input, options)).search, input.query),
    [runSearch]
  );

  const searchDocuments = useCallback(
    (input: SearchDocumentsInput, options?: RequestOptions) =>
      runSearch(async () => (await api.groundxSearch.searchGroundXDocuments(input, options)).search, input.query),
    [runSearch]
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    setSearch(null);
  }, []);

  return <SearchContext.Provider value={{ query, search, searchContent, searchDocuments, clearSearch }}>{children}</SearchContext.Provider>;
};

