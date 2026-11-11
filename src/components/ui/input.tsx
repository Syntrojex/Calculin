import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    const setRefs = (el: HTMLInputElement | null) => {
      innerRef.current = el
      if (typeof ref === "function") ref(el)
      else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = el
    }
    // Desktop-only: number fields get themed -/+ buttons instead of the
    // browser's grey spinner. Goes through stepUp/stepDown + an input event, so
    // the field's own onChange, min and max behave exactly as when typing.
    const step = (dir: 1 | -1) => {
      const el = innerRef.current
      if (!el || el.disabled || el.readOnly) return
      try { dir === 1 ? el.stepUp() : el.stepDown() } catch { return }
      el.dispatchEvent(new Event("input", { bubbles: true }))
      el.focus()
    }
    const field = (
      <input
        type={type}
        className={cn(
          type === "number" && "px-10",
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={setRefs}
        {...props}
      />
    )
    if (type !== "number") return field
    const btn =
      "flex absolute top-1/2 -translate-y-1/2 h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary text-base leading-none transition-all hover:bg-primary/25 active:scale-90 select-none"
    return (
      <div className="block relative">
        {field}
        <button type="button" tabIndex={-1} aria-label="Decrease" className={`${btn} left-1.5`} onPointerDown={(e) => e.preventDefault()} onClick={() => step(-1)}>−</button>
        <button type="button" tabIndex={-1} aria-label="Increase" className={`${btn} right-1.5`} onPointerDown={(e) => e.preventDefault()} onClick={() => step(1)}>+</button>
      </div>
    )
  }
)
Input.displayName = "Input"

export { Input }
