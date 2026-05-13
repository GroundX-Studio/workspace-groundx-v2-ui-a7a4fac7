import { createContext, FC, ReactNode, useContext, useState } from "react";

interface LoadingContextI {
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const LoadingContext = createContext<LoadingContextI | undefined>(undefined);

export const LoadingProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);

  return <LoadingContext.Provider value={{ isLoading, setIsLoading }}>{children}</LoadingContext.Provider>;
};

export const useIsLoading = (): LoadingContextI => {
  const context = useContext(LoadingContext);
  if (!context) throw new Error("useIsLoading must be used inside a LoadingProvider");
  return context;
};
