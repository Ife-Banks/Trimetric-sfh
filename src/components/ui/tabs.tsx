"use client"

// Tabs — underline style per 08 §3 "Tabs" (not pill/segmented). Active tab gets
// the --primary underline + --foreground text; inactive tabs get
// --muted-foreground with no underline. A single indicator slides between tabs
// over 200ms ease-in-out. Uses Radix Tabs for the roving-tabindex/keyboard
// behaviour and `aria-selected`/`role=tab` semantics.

import * as React from "react"
import { cn } from "cn"
import { Tabs as TabsPrimitive } from "radix-ui"

function Tabs({
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" {...props} />
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  const listRef = React.useRef<HTMLDivElement>(null)
  const indicatorRef = React.useRef<HTMLSpanElement>(null)

  const updateIndicator = React.useCallback(() => {
    const list = listRef.current
    const indicator = indicatorRef.current
    if (!list || !indicator) return
    const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]')
    if (!active) {
      indicator.style.opacity = "0"
      return
    }
    indicator.style.opacity = "1"
    indicator.style.width = `${active.offsetWidth}px`
    indicator.style.transform = `translateX(${active.offsetLeft}px)`
  }, [])

  React.useEffect(() => {
    updateIndicator()
    window.addEventListener("resize", updateIndicator)
    return () => window.removeEventListener("resize", updateIndicator)
  }, [updateIndicator])

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      onPointerDown={updateIndicator}
      onKeyUp={updateIndicator}
      className={cn(
        "relative inline-flex w-full items-start border-b border-border/80",
        className
      )}
      {...props}
    >
      {props.children}
      <span
        ref={indicatorRef}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary opacity-0 transition-[left,width,opacity,transform] duration-200 ease-in-out"
      />
    </TabsPrimitive.List>
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-200 outline-none select-none",
        "text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "data-[state=active]:font-semibold data-[state=active]:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("mt-4 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsContent, TabsList, TabsTrigger }