import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      duration={5000}
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-slate-200 shadow-(--shadow-card)",
        },
      }}
    />
  );
}
