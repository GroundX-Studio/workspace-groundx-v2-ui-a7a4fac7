import { FC, useState } from "react";
import { FormikHelpers } from "formik";
import { Helmet } from "react-helmet-async";
import { useNavigate } from "react-router-dom";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import LockOpenRoundedIcon from "@mui/icons-material/LockOpenRounded";
import MailLockIcon from "@mui/icons-material/MailLock";
import RestartAltIcon from "@mui/icons-material/RestartAlt";

import { BODY_TEXT, FONT_WEIGHT_LABEL, NAVY } from "@/constants";
import { useAuthContext } from "@/contexts/AuthContext";
import { useMessageContext } from "@/contexts/MessageBarContext";
import { ROUTER_PATHS } from "@/router/routerPaths";
import { APP_LOGOS, getPageTitle } from "@/appConfig";

import { AuthLayout } from "./AuthLayout";
import { ConfirmChangePasswordForm, ConfirmChangePasswordI } from "./Form/ConfirmChangePasswordForm";
import { VerificationEmailForm, VerificationEmailI } from "./Form/VerificationEmailForm";

export const ResetPassword: FC = () => {
  const navigate = useNavigate();
  const { setSuccessMessage } = useMessageContext();
  const { resetPassword, confirmChangingPassword } = useAuthContext();
  const [email, setEmail] = useState("");
  const [isCodeResend, setIsCodeResend] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const handleEmailSubmit = async (data: VerificationEmailI, formikBag: FormikHelpers<VerificationEmailI>) => {
    const response = await resetPassword(data.email);
    if (response.isSuccess) {
      setEmail(data.email);
      setIsVerified(true);
      setSuccessMessage(`Code sent to ${data.email}`);
    } else {
      formikBag.resetForm();
    }
  };

  const handleNewPasswordSubmit = async (
    data: ConfirmChangePasswordI,
    formikBag: FormikHelpers<ConfirmChangePasswordI>
  ) => {
    setIsCodeResend(false);
    const response = await confirmChangingPassword(data.code, email, data.password);
    if (response.isSuccess) {
      setSuccessMessage("Credential was successfully updated");
      setTimeout(() => navigate(ROUTER_PATHS.AUTH_LOGIN), 1000);
    } else {
      formikBag.resetForm();
    }
  };

  const resendCode = async () => {
    await resetPassword(email);
    setIsCodeResend(true);
  };

  return (
    <AuthLayout>
      <Helmet>
        <title>{getPageTitle("Reset Password")}</title>
      </Helmet>
      <Box sx={{ mt: 8, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <Box sx={{ mb: 1 }}>
          <Box
            component="img"
            src={APP_LOGOS.passwordReset.src}
            alt={APP_LOGOS.passwordReset.alt}
            sx={{ width: "100%", maxWidth: 220, height: "auto" }}
          />
        </Box>
        <Avatar sx={{ m: 1, bgcolor: NAVY }}>{isVerified ? <LockOpenRoundedIcon /> : <MailLockIcon />}</Avatar>
        <Typography fontWeight={FONT_WEIGHT_LABEL} variant="h6" sx={{ m: 1, color: BODY_TEXT }}>
          {isVerified ? "RESET YOUR PASSWORD" : "FORGOT PASSWORD"}
        </Typography>

        {isVerified ? (
          <Box>
            <Typography fontWeight={FONT_WEIGHT_LABEL} variant="body1" sx={{ mt: 1, color: BODY_TEXT }}>
              Check your email for the verification code and enter it below.
            </Typography>
            <Button
              type="button"
              variant="text"
              disableRipple
              onClick={resendCode}
              endIcon={<RestartAltIcon />}
              sx={{
                color: NAVY,
                fontWeight: FONT_WEIGHT_LABEL,
                textTransform: "none",
                pl: 0,
                textDecoration: "underline",
                "&:hover": { backgroundColor: "transparent", textDecoration: "underline" },
              }}
            >
              Resend code
            </Button>
            {isCodeResend ? (
              <Typography color="error" variant="subtitle2">
                Verification code successfully resent
              </Typography>
            ) : null}
          </Box>
        ) : (
          <Typography fontWeight={FONT_WEIGHT_LABEL} variant="body1" sx={{ mt: 1, color: BODY_TEXT }}>
            Enter your account email and we will send you a verification code to reset your password.
          </Typography>
        )}

        {isVerified ? (
          <ConfirmChangePasswordForm values={{ code: "", password: "" }} onSubmit={handleNewPasswordSubmit} />
        ) : (
          <VerificationEmailForm values={{ email: "" }} onSubmit={handleEmailSubmit} />
        )}

        <Grid container sx={{ mt: 3, mb: 5, justifyContent: "center", alignItems: "center" }}>
          <Grid item>
            <Link href={ROUTER_PATHS.AUTH_LOGIN} variant="body2" sx={{ color: BODY_TEXT, fontWeight: FONT_WEIGHT_LABEL }}>
              Back to Login
            </Link>
          </Grid>
        </Grid>
      </Box>
    </AuthLayout>
  );
};
