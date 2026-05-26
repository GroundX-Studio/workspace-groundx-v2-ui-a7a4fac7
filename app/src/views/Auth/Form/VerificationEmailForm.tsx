import { FC } from "react";
import { FormikHelpers, useFormik } from "formik";
import { object as yupObject, ObjectSchema, string as yupString } from "yup";
import TextField from "@mui/material/TextField";

import { WHITE } from "@/constants";
import { Button } from "@/components/primitives/Button/Button";

export interface VerificationEmailI {
  email: string;
}

interface VerificationEmailFormProps {
  values: VerificationEmailI;
  onSubmit: (values: VerificationEmailI, formikBag: FormikHelpers<VerificationEmailI>) => void;
}

const schema: ObjectSchema<VerificationEmailI> = yupObject().shape({
  email: yupString().email().required("Email is required"),
});

export const VerificationEmailForm: FC<VerificationEmailFormProps> = ({ values, onSubmit }) => {
  const formik = useFormik({
    initialValues: { email: values.email || "" },
    validationSchema: schema,
    onSubmit,
  });

  return (
    <form style={{ width: "100%" }} onSubmit={(event) => { event.preventDefault(); formik.handleSubmit(); }}>
      <TextField fullWidth id="email" name="email" label="Email" value={formik.values.email} onChange={formik.handleChange} onBlur={formik.handleBlur} error={formik.touched.email && Boolean(formik.errors.email)} helperText={formik.touched.email && formik.errors.email} sx={{ mt: 3, input: { background: WHITE } }} />
      <Button variant="primary" type="submit" submitting={formik.isSubmitting} sx={{ m: 0, mt: 4, height: 48 }} fullWidth>
        Submit
      </Button>
    </form>
  );
};
