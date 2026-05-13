export const makeAnimationStartHandler =
  (stateSetter: React.Dispatch<React.SetStateAction<boolean>>) => (event: React.AnimationEvent<HTMLInputElement>) => {
    const autofilled = !!event.currentTarget?.matches("*:-webkit-autofill");
    if (event.animationName === "mui-auto-fill" || event.animationName === "mui-auto-fill-cancel") {
      stateSetter(autofilled);
    }
  };
