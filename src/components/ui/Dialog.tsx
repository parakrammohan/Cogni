import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from "react";
import { forwardRef } from "react";

import { cx } from "../../lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

const DialogOverlay = forwardRef<
  ElementRef<typeof DialogPrimitive.Overlay>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(function DialogOverlay({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cx(
        "fixed inset-0 z-[1100] bg-slate-900/40 backdrop-blur-sm",
        "data-[state=open]:animate-in data-[state=open]:fade-in",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out",
        className,
      )}
      {...props}
    />
  );
});

interface DialogContentProps
  extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  showClose?: boolean;
  closeLabel?: string;
  children: ReactNode;
}

export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent(
  { className, children, showClose = true, closeLabel = "Close dialog", ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cx(
          "fixed left-1/2 top-1/2 z-[1100] grid w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-(--shadow-elevated)",
          "max-h-[90vh] overflow-y-auto",
          "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-2",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out",
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? (
          <DialogPrimitive.Close
            aria-label={closeLabel}
            className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <X size={18} />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
