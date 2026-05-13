import { createContext, FC, ReactNode, useContext, useState } from "react";

interface MessageBarContextI {
  successMessage: string;
  errorMessage: string;
  setSuccessMessage: (message: string) => void;
  setErrorMessage: (message: string) => void;
}

const MessageBarContext = createContext<MessageBarContextI | undefined>(undefined);

export const MessageBarProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  return (
    <MessageBarContext.Provider value={{ successMessage, errorMessage, setSuccessMessage, setErrorMessage }}>
      {children}
    </MessageBarContext.Provider>
  );
};

export const useMessageContext = (): MessageBarContextI => {
  const context = useContext(MessageBarContext);
  if (!context) throw new Error("useMessageContext must be used inside a MessageBarProvider");
  return context;
};
