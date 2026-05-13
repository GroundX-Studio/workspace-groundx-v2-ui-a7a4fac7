import { useContext } from "react";

import { HealthContext, HealthContextI } from "./HealthContext";
export { HealthProvider } from "./HealthProvider";

export const useHealthContext = (): HealthContextI => {
  const context = useContext(HealthContext);
  if (!context) throw new Error("useHealthContext must be used inside a HealthProvider");
  return context;
};

