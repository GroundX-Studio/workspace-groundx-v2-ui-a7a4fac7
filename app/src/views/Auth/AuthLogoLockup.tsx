import Box from "@mui/material/Box";

import { APP_LOGOS } from "@/appConfig";

export const AuthLogoLockup = () => {
  return (
    <Box sx={{ mb: 2 }}>
      <Box
        component="img"
        src={APP_LOGOS.auth.src}
        alt={APP_LOGOS.auth.alt}
        sx={{ width: "100%", maxWidth: 280, height: "auto" }}
      />
    </Box>
  );
};
