import { createContextHook } from "@/contexts/createEntityContext";

import { HealthContext } from "./HealthContext";
export { HealthProvider } from "./HealthProvider";

export const useHealthContext = createContextHook(HealthContext, "useHealthContext must be used inside a HealthProvider");
