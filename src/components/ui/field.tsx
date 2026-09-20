"use client"

// Field — the standardised form-field pattern: label + control + helper + error.
// It generates the control id and wires aria-invalid / aria-describedby onto the
// single control child automatically. Radix controls (Select) own their trigger
// id, so pass `noClone` and give the inner SelectTrigger a matching id yourself.

import {
  useId,
  isValidElement,
  cloneElement,
  type ReactElement,
  type ReactNode,
} from "react"
import { cn } from "cn"
import { Label } from "@/components/ui/label"

interface FieldProps {
  label: string
  /** Optional fixed control id. When omitted, Field generates one used by both label and control. */
  htmlFor?: string
  required?: boolean
  error?: string | null
  helper?: ReactNode
  className?: string
  /** Skip cloning (for Radix roots like Select). Supply htmlFor matching the inner trigger id. */
  noClone?: boolean
  children: ReactNode
}

function Field({
  label,
  htmlFor,
  required,
  error,
  helper,
  className,
  noClone,
  children,
}: FieldProps) {
  const autoId = useId()
  const reasonId = useId()
  const id = htmlFor ?? autoId

  let control = children
  if (!noClone && isValidElement(children)) {
    control = cloneElement(children as ReactElement<Record<string, unknown>>, {
      id,
      ...(error ? { "aria-invalid": true } : {}),
      ...(error || helper ? { "aria-describedby": reasonId } : {}),
    })
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </Label>
      {control}
      {(error || helper) && (
        <p
          id={reasonId}
          className={cn("text-xs", error ? "font-medium text-destructive" : "text-muted-foreground")}
        >
          {error ?? helper}
        </p>
      )}
    </div>
  )
}

export { Field }