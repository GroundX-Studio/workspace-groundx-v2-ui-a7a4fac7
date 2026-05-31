import { createContext } from "react";

import { RequestOptions } from "@/api/common";
import { SearchContentInput, SearchDocumentsInput } from "@/api/entities/groundxSearchEntity";
import { SearchResponseBody } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface SearchContextI {
  query: string;
  search: SearchResponseBody | null;
  searchContent: (input: SearchContentInput, options?: RequestOptions) => Promise<SdkActionResult<SearchResponseBody>>;
  searchDocuments: (input: SearchDocumentsInput, options?: RequestOptions) => Promise<SdkActionResult<SearchResponseBody>>;
  clearSearch: () => void;
}

export const SearchContext = createContext<SearchContextI | undefined>(undefined);

