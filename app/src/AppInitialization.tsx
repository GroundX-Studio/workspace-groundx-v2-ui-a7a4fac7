import { FC, ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuthContext } from "@/contexts/AuthContext";
import { ROUTER_PATHS } from "@/router/routerPaths";

interface AppInitializationProps {
  children: ReactNode;
}

const emptyAuth = {
  userName: "",
  token: "",
  isLoggedIn: false,
  xJwtToken: "",
};

export const AppInitialization: FC<AppInitializationProps> = ({ children }) => {
  const { auth, getUserData, setAuth } = useAuthContext();
  const navigate = useNavigate();
  const [isHydrating, setIsHydrating] = useState(true);

  useEffect(() => {
    let isActive = true;

    void (async () => {
      if (auth.isLoggedIn) {
        setIsHydrating(false);
        return;
      }

      const result = await getUserData();
      if (!isActive) return;

      if (result.error || !result.response) {
        setAuth(emptyAuth);
        navigate(ROUTER_PATHS.AUTH_LOGIN);
      }

      setIsHydrating(false);
    })();

    return () => {
      isActive = false;
    };
  }, [auth.isLoggedIn, getUserData, navigate, setAuth]);

  return <>{auth.isLoggedIn && !isHydrating ? children : <div>Loading...</div>}</>;
};
