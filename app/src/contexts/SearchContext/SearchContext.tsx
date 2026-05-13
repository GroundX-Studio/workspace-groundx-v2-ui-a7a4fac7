import { createContext } from "react";

import { GroundXRequestOptions } from "@/api/common";
import { SearchContentInput, SearchDocumentsInput } from "@/api/entities/groundxSearchEntity";
import { SearchResponseBody } from "@/api/entities/sdkTypes";
import { SdkActionResult } from "@/contexts/sdkContextTypes";

export interface SearchContextI {
  query: string;
  search: SearchResponseBody | null;
  searchContent: (input: SearchContentInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<SearchResponseBody>>;
  searchDocuments: (input: SearchDocumentsInput, options?: GroundXRequestOptions) => Promise<SdkActionResult<SearchResponseBody>>;
  clearSearch: () => void;
}

export const SearchContext = createContext<SearchContextI | undefined>(undefined);

