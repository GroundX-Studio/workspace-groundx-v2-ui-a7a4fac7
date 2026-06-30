import { createContext } from "react";

import type { RequestOptions } from "@/api/common";
import type { SearchContentInput, SearchDocumentsInput } from "@/api/entities/groundxSearchEntity";
import type { SearchResponseBody } from "@/api/entities/sdkTypes";
import type { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface SearchContextI {
  query: string;
  search: SearchResponseBody | null;
  searchContent: (input: SearchContentInput, options?: RequestOptions) => Promise<SdkActionResult<SearchResponseBody>>;
  searchDocuments: (input: SearchDocumentsInput, options?: RequestOptions) => Promise<SdkActionResult<SearchResponseBody>>;
  clearSearch: () => void;
}

export const SearchContext = createContext<SearchContextI | undefined>(undefined);
