import { FC, ReactNode, useState } from "react";
import { FormikHelpers, useFormik } from "formik";
import { object as yupObject, ObjectSchema, string as yupString } from "yup";
import TextField from "@mui/material/TextField";

import type { LoginI } from "@/api/entities/customerEntity";
import { WHITE } from "@/constants";
import { Button } from "@/components/primitives/Button/Button";
import { PasswordField } from "@/components/primitives/PasswordField/PasswordField";
import { makeAnimationStartHandler } from "@/shared/utils/makeAnimationStartHandler";

interface LoginFormProps {
  values: LoginI;
  forgotPassword?: ReactNode;
  onSubmit: (values: LoginI, formikBag: FormikHelpers<LoginI>) => void;
}

const schema: ObjectSchema<LoginI> = yupObject().shape({
  email: yupString().email().required("Email is required"),
  password: yupString().required("Password is required"),
});

const initValues = (values: LoginI): LoginI => ({
  email: values.email || "",
  password: values.password || "",
});

export const LOGIN_SUBMIT_LABEL = "Continue";

export const LoginForm: FC<LoginFormProps> = ({ values, forgotPassword, onSubmit }) => {
  const [emailHasValue, setEmailHasValue] = useState(false);
  const [passwordHasValue, setPasswordHasValue] = useState(false);

  const formik = useFormik({
    initialValues: initValues(values),
    validationSchema: schema,
    onSubmit,
  });

  return (
    <form
      id="login-form"
      onSubmit={(event) => {
        event.preventDefault();
        formik.handleSubmit();
      }}
    >
      <TextField
        fullWidth
        id="email"
        name="email"
        autoComplete="email"
        label="Email"
        value={formik.values.email}
        onChange={(event) => {
          setEmailHasValue(true);
          formik.handleChange(event);
        }}
        onBlur={formik.handleBlur}
        error={formik.touched.email && Boolean(formik.errors.email)}
        helperText={formik.touched.email && formik.errors.email}
        InputLabelProps={{ shrink: emailHasValue }}
        InputProps={{ onAnimationStart: makeAnimationStartHandler(setEmailHasValue) }}
        sx={{ mt: 3, input: { background: WHITE } }}
      />

      <PasswordField
        fullWidth
        id="password"
        name="password"
        autoComplete="current-password"
        label="Password"
        noTool="pre-app auth (not agent-driven)"
        value={formik.values.password}
        onChange={(event) => {
          setPasswordHasValue(true);
          formik.handleChange(event);
        }}
        onBlur={formik.handleBlur}
        error={formik.touched.password && Boolean(formik.errors.password)}
        helperText={formik.touched.password && formik.errors.password}
        InputLabelProps={{ shrink: passwordHasValue }}
        InputProps={{
          onAnimationStart: makeAnimationStartHandler(setPasswordHasValue),
        }}
        sx={{ mt: 2, input: { background: WHITE } }}
      />

      {forgotPassword}

      <Button noTool="pre-app auth (not agent-driven)" variant="primary" type="submit" id="login-submit" submitting={formik.isSubmitting} sx={{ m: 0, mt: 4, height: 48 }} fullWidth>
        {LOGIN_SUBMIT_LABEL}
      </Button>
    </form>
  );
};
