import { createContextHook } from "@/contexts/createEntityContext";

import { GroupsContext, GroupsContextI } from "./GroupsContext";
export { GroupsProvider } from "./GroupsProvider";

export const useGroupsContext = createContextHook(GroupsContext, "useGroupsContext must be used inside a GroupsProvider");
