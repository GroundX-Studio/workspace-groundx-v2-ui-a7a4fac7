import { createContextHook } from "@/contexts/createEntityContext";

import { BucketsContext } from "./BucketsContext";
export { BucketsProvider } from "./BucketsProvider";

export const useBucketsContext = createContextHook(BucketsContext, "useBucketsContext must be used inside a BucketsProvider");
