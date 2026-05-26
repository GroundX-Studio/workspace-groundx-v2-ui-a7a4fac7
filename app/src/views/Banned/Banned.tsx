import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

import { FULL_VIEWPORT_MIN_HEIGHT, MAIN_BACKGROUND } from "@/constants";

export const Banned = () => {
  return (
    <Box sx={{ minHeight: FULL_VIEWPORT_MIN_HEIGHT, display: "grid", placeItems: "center", backgroundColor: MAIN_BACKGROUND, p: 3 }}>
      <Typography variant="h5">This account is not available.</Typography>
    </Box>
  );
};
