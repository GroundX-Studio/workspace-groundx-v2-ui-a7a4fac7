import { createContextHook } from "@/contexts/createEntityContext";

import { BucketsContext, BucketsContextI } from "./BucketsContext";
export { BucketsProvider } from "./BucketsProvider";

export const useBucketsContext = createContextHook(BucketsContext, "useBucketsContext must be used inside a BucketsProvider");
