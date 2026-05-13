import { useContext } from "react";

import { GroupsContext, GroupsContextI } from "./GroupsContext";
export { GroupsProvider } from "./GroupsProvider";

export const useGroupsContext = (): GroupsContextI => {
  const context = useContext(GroupsContext);
  if (!context) throw new Error("useGroupsContext must be used inside a GroupsProvider");
  return context;
};

