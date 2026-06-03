import { FC } from "react";
import { FormikHelpers } from "formik";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import type { LoginI } from "@/api/entities/customerEntity";
import { BODY_TEXT, FONT_WEIGHT_LABEL, NAVY } from "@/constants";
import { useAuthContext } from "@/contexts/AuthContext";
import { useIsLoading } from "@/contexts/LoadingContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { ROUTER_PATHS } from "@/router/routerPaths";
import { getPageTitle } from "@/appConfig";

import { AuthLayout } from "./AuthLayout";
import { AuthLogoLockup } from "./AuthLogoLockup";
import { LoginForm } from "./Form/LoginForm";

export const LOGIN_PAGE_TITLE = "Login";

export const Login: FC = () => {
  const { setIsLoading } = useIsLoading();
  const { setErrorMessage } = useMessageContext();
  const { login } = useAuthContext();
  const navigate = useNavigate();

  const handleSubmit = async (data: LoginI, formikBag: FormikHelpers<LoginI>) => {
    setIsLoading(true);
    const result = await login(data);

    if (result.kind === "banned") {
      setIsLoading(false);
      navigate(ROUTER_PATHS.BANNED);
      return;
    }

    if (result.kind === "success") {
      navigate(ROUTER_PATHS.HOME);
    } else {
      formikBag.resetForm();
      setErrorMessage("Login data is not valid");
    }

    setIsLoading(false);
  };

  return (
    <AuthLayout>
      <Helmet>
        <title>{getPageTitle(LOGIN_PAGE_TITLE)}</title>
      </Helmet>
      <Box sx={{ mt: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <AuthLogoLockup />
        <Typography fontWeight={FONT_WEIGHT_LABEL} variant="h6" sx={{ color: NAVY }}>
          LOGIN
        </Typography>
        <LoginForm
          values={{ email: "", password: "" }}
          onSubmit={handleSubmit}
          forgotPassword={
            <Button
              type="button"
              variant="text"
              disableRipple
              onClick={() => navigate(ROUTER_PATHS.AUTH_RESET_PASSWORD)}
              sx={{
                color: BODY_TEXT,
                fontWeight: FONT_WEIGHT_LABEL,
                textTransform: "none",
                textDecoration: "underline",
              }}
            >
              Forgot your password?
            </Button>
          }
        />
        <Grid container sx={{ mt: 3, mb: 5, justifyContent: "center", alignItems: "center" }}>
          <Grid item>
            <Link href={ROUTER_PATHS.AUTH_REGISTER} variant="body2" sx={{ color: BODY_TEXT, fontWeight: FONT_WEIGHT_LABEL }}>
              Do not have an account? Create one.
            </Link>
          </Grid>
        </Grid>
      </Box>
    </AuthLayout>
  );
};
