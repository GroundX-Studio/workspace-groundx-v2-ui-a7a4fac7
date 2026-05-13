import { FC, useState } from "react";
import { FormikHelpers, useFormik } from "formik";
import { object as yupObject, ObjectSchema, string as yupString } from "yup";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";

import { DARK_GREY, GRAY, WHITE } from "@/constants";
import { CommonSubmitButton } from "@/shared/components/CommonSubmitButton";

export interface ConfirmChangePasswordI {
  code: string;
  password: string;
}

interface ConfirmChangePasswordFormProps {
  values: ConfirmChangePasswordI;
  onSubmit: (values: ConfirmChangePasswordI, formikBag: FormikHelpers<ConfirmChangePasswordI>) => void;
}

const getCharacterValidationError = (value: string) => `Your password must have at least 1 ${value} character`;

const schema: ObjectSchema<ConfirmChangePasswordI> = yupObject().shape({
  code: yupString().matches(/^[0-9]{6}$/, "Code must be exactly 6 digits").required("Code is required"),
  password: yupString()
    .min(8, "Password must have at least 8 characters")
    .max(32, "Password must have less than 32 characters")
    .matches(/[a-z]/, getCharacterValidationError("lowercase"))
    .required("Password is required"),
});

export const ConfirmChangePasswordForm: FC<ConfirmChangePasswordFormProps> = ({ values, onSubmit }) => {
  const [showPassword, setShowPassword] = useState(false);
  const formik = useFormik({
    initialValues: { code: values.code || "", password: values.password || "" },
    validationSchema: schema,
    onSubmit,
  });

  return (
    <form id="change-password-form" onSubmit={(event) => { event.preventDefault(); formik.handleSubmit(); }}>
      <TextField fullWidth id="code" name="code" label="Code" value={formik.values.code} onChange={formik.handleChange} onBlur={formik.handleBlur} error={formik.touched.code && Boolean(formik.errors.code)} helperText={formik.touched.code && formik.errors.code} sx={{ mt: 2, input: { background: WHITE } }} />
      <TextField
        fullWidth
        id="password"
        name="password"
        label="Enter your new password"
        type={showPassword ? "text" : "password"}
        value={formik.values.password}
        onChange={formik.handleChange}
        onBlur={formik.handleBlur}
        error={formik.touched.password && Boolean(formik.errors.password)}
        helperText={formik.touched.password && formik.errors.password}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton sx={{ backgroundColor: "inherit", "&:hover": { backgroundColor: GRAY } }} aria-label="toggle password visibility" disableRipple onClick={() => setShowPassword((prev) => !prev)}>
                {showPassword ? <Visibility fontSize="small" sx={{ color: DARK_GREY }} /> : <VisibilityOffIcon fontSize="small" sx={{ color: DARK_GREY }} />}
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ mt: 2, input: { background: WHITE } }}
      />
      <CommonSubmitButton type="submit" id="change-password-submit" sx={{ m: 0, mt: 4, height: 48 }} fullWidth>
        Submit
      </CommonSubmitButton>
    </form>
  );
};
