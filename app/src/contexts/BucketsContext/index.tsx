import { useContext } from "react";

import { BucketsContext, BucketsContextI } from "./BucketsContext";
export { BucketsProvider } from "./BucketsProvider";

export const useBucketsContext = (): BucketsContextI => {
  const context = useContext(BucketsContext);
  if (!context) throw new Error("useBucketsContext must be used inside a BucketsProvider");
  return context;
};

