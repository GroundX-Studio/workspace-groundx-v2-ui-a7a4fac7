import { ChangeEvent, FC } from "react";
import { FormikHelpers, useFormik } from "formik";
import { boolean as yupBoolean, object as yupObject, ObjectSchema, ref as yupRef, string as yupString } from "yup";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormGroup from "@mui/material/FormGroup";
import FormHelperText from "@mui/material/FormHelperText";
import Link from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import TaskAltIcon from "@mui/icons-material/TaskAlt";

import { RegisterI } from "@/api/entities/customerEntity";
import { APP_CONFIG } from "@/appConfig";
import { BODY_TEXT, NAVY, WHITE } from "@/constants";
import { Button } from "@/components/primitives/Button/Button";
import { PasswordField } from "@/components/primitives/PasswordField/PasswordField";

interface RegisterFormProps {
  values: RegisterI;
  onSubmit: (values: RegisterI, formikBag: FormikHelpers<RegisterI>) => void;
}

const latinSymbolsRegex = /^[A-Za-z0-9\s.,:;!?()[\]{}'"\-+*/&%@#$^=<>]*$/;
const errorMessageLatinSymbol = "Only Latin symbols are allowed";
const getCharacterValidationError = (value: string) => `Your password must have at least 1 ${value} character`;

const schema: ObjectSchema<RegisterI> = yupObject().shape({
  email: yupString().email().required("Email is required"),
  first: yupString().matches(latinSymbolsRegex, errorMessageLatinSymbol).max(128).required("First Name is required"),
  last: yupString().matches(latinSymbolsRegex, errorMessageLatinSymbol).max(128).required("Last Name is required"),
  password: yupString()
    .min(8, "Password must have at least 8 characters")
    .max(32, "Password must have less than 32 characters")
    .matches(latinSymbolsRegex, errorMessageLatinSymbol)
    .matches(/[a-z]/, getCharacterValidationError("lowercase"))
    .required("Password is required"),
  confirmPassword: yupString()
    .required("Password should match. Please re-type your password")
    .oneOf([yupRef("password")], "Passwords do not match"),
  companyName: yupString().matches(latinSymbolsRegex, errorMessageLatinSymbol).max(128),
  endUserLicenseAgreement: yupBoolean().oneOf([true], "You must accept the terms and conditions").required(),
  xrayEmail: yupString().email("Invalid email format").nullable().optional(),
});

const initValues = (values: RegisterI): RegisterI => ({
  first: values.first || "",
  last: values.last || "",
  email: values.email || "",
  password: values.password || "",
  confirmPassword: values.confirmPassword || "",
  companyName: values.companyName || "",
  endUserLicenseAgreement: values.endUserLicenseAgreement,
  xrayEmail: values.xrayEmail || null,
});

export const RegisterForm: FC<RegisterFormProps> = ({ values, onSubmit }) => {
  const formik = useFormik({
    initialValues: initValues(values),
    enableReinitialize: true,
    validationSchema: schema,
    onSubmit,
  });

  return (
    <form
      id="register-form"
      onSubmit={(event) => {
        event.preventDefault();
        formik.handleSubmit();
      }}
    >
      <TextField fullWidth id="first" name="first" label="First Name *" value={formik.values.first} onChange={formik.handleChange} onBlur={formik.handleBlur} error={formik.touched.first && Boolean(formik.errors.first)} helperText={formik.touched.first && formik.errors.first} sx={{ mt: 2, input: { background: WHITE } }} />
      <TextField fullWidth id="last" name="last" label="Last Name *" value={formik.values.last} onChange={formik.handleChange} onBlur={formik.handleBlur} error={formik.touched.last && Boolean(formik.errors.last)} helperText={formik.touched.last && formik.errors.last} sx={{ mt: 2, input: { background: WHITE } }} />
      <TextField fullWidth id="email" name="email" label="Email *" value={formik.values.email} onChange={formik.handleChange} onBlur={formik.handleBlur} error={formik.touched.email && Boolean(formik.errors.email)} helperText={formik.touched.email && formik.errors.email} sx={{ mt: 2, input: { background: WHITE } }} />
      <PasswordField fullWidth id="password" name="password" label="Password *" noTool="pre-app auth (not agent-driven)" value={formik.values.password} onChange={formik.handleChange} onBlur={formik.handleBlur} error={formik.touched.password && Boolean(formik.errors.password)} helperText={formik.touched.password && formik.errors.password} sx={{ mt: 2, input: { background: WHITE } }} />
      <PasswordField fullWidth id="confirmPassword" name="confirmPassword" label="Confirm Password *" noTool="pre-app auth (not agent-driven)" value={formik.values.confirmPassword} onChange={formik.handleChange} onBlur={formik.handleBlur} error={formik.touched.confirmPassword && Boolean(formik.errors.confirmPassword)} helperText={formik.touched.confirmPassword && formik.errors.confirmPassword} sx={{ mt: 2, input: { background: WHITE } }} />
      <TextField fullWidth id="companyName" name="companyName" label="Company Name" value={formik.values.companyName} onChange={formik.handleChange} onBlur={formik.handleBlur} error={formik.touched.companyName && Boolean(formik.errors.companyName)} helperText={formik.touched.companyName && formik.errors.companyName} sx={{ mt: 2, input: { background: WHITE } }} />

      <FormGroup sx={{ mt: 2 }}>
        <FormControlLabel
          name="endUserLicenseAgreement"
          checked={formik.values.endUserLicenseAgreement}
          control={
            <Checkbox
              inputProps={{ "aria-label": "controlled" }}
              onChange={({ target }: ChangeEvent<HTMLInputElement>) =>
                formik.setFieldValue("endUserLicenseAgreement", target.checked)
              }
              sx={{ color: BODY_TEXT, "&.Mui-checked": { color: NAVY } }}
            />
          }
          label={
            <Link
              target="_blank"
              href={APP_CONFIG.legal.termsUrl}
              rel="noreferrer"
              underline="none"
              sx={{ color: NAVY }}
            >
              I have read and accept the terms of the End User License Agreement.
            </Link>
          }
        />
        {formik.touched.endUserLicenseAgreement && formik.errors.endUserLicenseAgreement && (
          <FormHelperText error>{formik.errors.endUserLicenseAgreement}</FormHelperText>
        )}
      </FormGroup>

      <Button noTool="pre-app auth (not agent-driven)" variant="primary" type="submit" id="register-submit" submitting={formik.isSubmitting} endIcon={<TaskAltIcon />} sx={{ m: 0, mt: 4, height: 48 }} fullWidth>
        Register
      </Button>
    </form>
  );
};
