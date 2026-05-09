import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentPropsWithoutRef, ElementRef } from "react";
import { forwardRef } from "react";

import { cx } from "../../lib/utils";

export const Slider = forwardRef<
  ElementRef<typeof SliderPrimitive.Root>,
  ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(function Slider({ className, ...props }, ref) {
  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cx(
        "relative flex w-full touch-none select-none items-center py-3",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-slate-200">
        <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-cyan-500 to-cyan-400" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb
        className={cx(
          "block h-6 w-6 rounded-full border-2 border-cyan-600 bg-white shadow-md transition",
          "hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
        )}
      />
    </SliderPrimitive.Root>
  );
});
