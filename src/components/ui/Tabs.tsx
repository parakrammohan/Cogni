import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ComponentPropsWithoutRef, ElementRef, ReactNode } from "react";
import { forwardRef } from "react";

import { cx } from "../../lib/utils";

export const Tabs = TabsPrimitive.Root;

export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cx(
        "inline-flex flex-wrap items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-(--shadow-soft)",
        className,
      )}
      {...props}
    />
  );
});

interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> {
  icon?: ReactNode;
}

export const TabsTrigger = forwardRef<ElementRef<typeof TabsPrimitive.Trigger>, TabsTriggerProps>(
  function TabsTrigger({ className, children, icon, ...props }, ref) {
    return (
      <TabsPrimitive.Trigger
        ref={ref}
        className={cx(
          "inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 transition",
          "hover:bg-slate-100 hover:text-slate-900",
          "data-[state=active]:bg-slate-900 data-[state=active]:text-white data-[state=active]:shadow-sm",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-1",
          className,
        )}
        {...props}
      >
        {icon ? <span aria-hidden>{icon}</span> : null}
        {children}
      </TabsPrimitive.Trigger>
    );
  },
);

export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cx(
        "mt-4 focus-visible:outline-none animate-in fade-in slide-in-from-bottom-1 duration-200",
        className,
      )}
      {...props}
    />
  );
});
