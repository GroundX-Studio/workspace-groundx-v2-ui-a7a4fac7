import { FC, useEffect, useState } from "react";
import { FormikHelpers } from "formik";
import { Helmet } from "react-helmet-async";
import { useLocation, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";

import { RegisterI } from "@/api/entities/customerEntity";
import { BODY_TEXT, FONT_WEIGHT_LABEL, NAVY } from "@/constants";
import { useAuthContext } from "@/contexts/AuthContext";
import { ROUTER_PATHS } from "@/router/routerPaths";
import { getPageTitle } from "@/appConfig";
import { getEmailType } from "@/shared/utils/emailUtils";

import { AuthLayout } from "./AuthLayout";
import { AuthLogoLockup } from "./AuthLogoLockup";
import { RegisterForm } from "./Form/RegisterForm";

const initialFormData: RegisterI = {
  first: "",
  last: "",
  email: "",
  companyName: "",
  password: "",
  confirmPassword: "",
  endUserLicenseAgreement: false,
  xrayEmail: null,
};

export const Register: FC = () => {
  const { register } = useAuthContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const firstName = searchParams.get("fn");
    const lastName = searchParams.get("ln");
    const company = searchParams.get("c");
    let email = searchParams.get("e");
    const password = searchParams.get("p");
    const updatedValues: Partial<RegisterI> = {};

    if (!email) {
      const xrayEmail = localStorage.getItem("x-ray-demo-email");
      if (xrayEmail) {
        email = xrayEmail;
        updatedValues.xrayEmail = email;
      }
    } else {
      email = window.atob(email);
    }

    if (firstName) updatedValues.first = window.atob(firstName);
    if (lastName) updatedValues.last = window.atob(lastName);
    if (email) updatedValues.email = email;
    if (company) updatedValues.companyName = window.atob(company);
    if (password) {
      updatedValues.password = window.atob(password);
      updatedValues.confirmPassword = window.atob(password);
    }
    updatedValues.endUserLicenseAgreement = true;

    setFormData((previous) => ({ ...previous, ...updatedValues }));
  }, [location.search]);

  const handleSubmit = async (data: RegisterI, formikBag: FormikHelpers<RegisterI>) => {
    const emailType = getEmailType(data.email);

    if (emailType === "invalid") {
      formikBag.setFieldError("email", "Please enter a valid email address.");
      return;
    }

    if (emailType === "personal") {
      formikBag.setFieldError("email", "Please enter a business email address.");
      return;
    }

    const result = await register(data);
    if (result.isSuccess) {
      navigate(ROUTER_PATHS.HOME);
    } else {
      formikBag.resetForm();
    }
  };

  return (
    <AuthLayout isTall>
      <Helmet>
        <title>{getPageTitle("Register")}</title>
      </Helmet>
      <Box sx={{ mt: 4, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <AuthLogoLockup />
        <Box sx={{ mb: 2, textAlign: "center" }}>
          <Typography fontWeight={FONT_WEIGHT_LABEL} sx={{ color: NAVY }}>
            Register for GroundX Studio.
          </Typography>
        </Box>
        <RegisterForm values={formData} onSubmit={handleSubmit} />
        <Grid container sx={{ mt: 3, mb: 4, justifyContent: "center", alignItems: "center" }}>
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
