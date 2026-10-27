import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border text-xs font-medium whitespace-nowrap select-none transition-[transform,box-shadow,background-color,color] duration-100 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-edge bg-ochre text-ochre-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.28),0_1px_0_var(--edge),0_2px_4px_rgb(0_0_0/0.22)] hover:bg-[color-mix(in_oklab,var(--ochre)_88%,var(--ink))] active:translate-y-px active:shadow-[inset_0_2px_5px_rgb(0_0_0/0.32)]",
        outline:
          "border-edge bg-face-raised text-ink shadow-[inset_0_1px_0_var(--line-hi),0_1px_0_var(--edge),0_2px_3px_rgb(0_0_0/0.16)] hover:bg-muted active:translate-y-px active:shadow-[inset_0_2px_4px_rgb(0_0_0/0.2),inset_0_-1px_0_var(--line-hi)]",
        secondary:
          "border-edge bg-well text-ink hover:bg-muted active:translate-y-px",
        ghost:
          "border-transparent bg-transparent text-ink-muted hover:bg-muted hover:text-ink active:translate-y-px",
        destructive:
          "border-record/45 bg-record/12 text-record hover:bg-record/20 active:translate-y-px",
        link: "border-transparent bg-transparent text-ochre underline-offset-4 hover:underline",
      },
      size: {
        default: "h-8 px-3",
        xs: "h-6 gap-1 px-2 text-[11px] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 px-4",
        icon: "size-8",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
