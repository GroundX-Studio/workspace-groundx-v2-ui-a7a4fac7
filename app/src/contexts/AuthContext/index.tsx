import { useContext } from "react";

import { AuthContext, AuthContextI } from "./AuthContext";

export const useAuthContext = (): AuthContextI => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuthContext must be used inside an AuthProvider");
  return context;
};
