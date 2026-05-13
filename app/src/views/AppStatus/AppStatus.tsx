import Typography from "@mui/material/Typography";

import { GxCard } from "@/shared/components/GxCard";

export const AppStatus = () => (
  <GxCard>
    <Typography variant="h5">Application Status</Typography>
    <Typography variant="body1" sx={{ mt: 1 }}>
      Replace this scaffold status page with product-specific operational status, usage, or account-health details.
    </Typography>
  </GxCard>
);
