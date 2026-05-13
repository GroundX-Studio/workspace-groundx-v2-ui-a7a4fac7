import { FC, ReactNode } from "react";
import Box from "@mui/material/Box";
import Container from "@mui/material/Container";

import { BORDER_RADIUS, MAIN_BACKGROUND, WHITE } from "@/constants";

interface AuthLayoutProps {
  children: ReactNode;
  isTall?: boolean;
}

export const AuthLayout: FC<AuthLayoutProps> = ({ children, isTall = false }) => {
  return (
    <Box
      sx={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: MAIN_BACKGROUND,
        px: 2,
        py: isTall ? 10 : 3,
      }}
    >
      <Container
        component="main"
        maxWidth="xs"
        sx={{
          backgroundColor: WHITE,
          borderRadius: BORDER_RADIUS,
        }}
      >
        {children}
      </Container>
    </Box>
  );
};
