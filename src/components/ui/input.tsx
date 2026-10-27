import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-edge bg-well px-3 py-1 text-[13px] text-ink transition-colors outline-none",
        "shadow-[inset_0_2px_5px_rgb(0_0_0/0.16)]",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-ink",
        "placeholder:text-ink-faint",
        "focus-visible:border-ochre/70 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ochre/25",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-record aria-invalid:outline-2 aria-invalid:outline-offset-0 aria-invalid:outline-record/25",
        className
      )}
      {...props}
    />
  )
}

export { Input }
