import { useRef, useState, useCallback } from "react";
import { Keyboard } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MathKeypad } from "./MathKeypad";
import { cn } from "@/lib/utils";
import { normalizeMathInput } from "@/lib/text-normalize";
import { exprToLatex } from "@/lib/latex";
import { MathTex } from "./MathTex";

interface MathInputProps {
  value: string;
  onChange: (val: string) => void;
  onEnter?: () => void;
  placeholder?: string;
  className?: string;
  label?: string;
  /** Show keypad toggle button — default true */
  withKeypad?: boolean;
}

/**
 * Drop-in replacement for Input in calculator expression fields.
 * Renders a math keypad toggle button alongside the input; when the
 * keypad is open the native mobile keyboard is suppressed so only the
 * math keypad is used. Cursor-position-aware: inserted text lands at
 * the caret, not always at the end.
 */
export function MathInput({
  value,
  onChange,
  onEnter,
  placeholder,
  className,
  withKeypad = true,
}: MathInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [showKeypad, setShowKeypad] = useState(false);

  /** Insert `text` at the current cursor selection, then reposition the caret. */
  const insertAtCursor = useCallback(
    (text: string) => {
      const el = inputRef.current;
      const start = el?.selectionStart ?? value.length;
      const end   = el?.selectionEnd   ?? value.length;
      const next  = value.slice(0, start) + text + value.slice(end);
      const newPos = start + text.length;
      onChange(next);
      // Restore caret after React re-render
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(newPos, newPos);
      });
    },
    [value, onChange]
  );

  const handleBackspace = useCallback(() => {
    const el = inputRef.current;
    const start = el?.selectionStart ?? value.length;
    const end   = el?.selectionEnd   ?? value.length;
    let next: string;
    let newPos: number;
    if (start !== end) {
      next   = value.slice(0, start) + value.slice(end);
      newPos = start;
    } else if (start > 0) {
      next   = value.slice(0, start - 1) + value.slice(start);
      newPos = start - 1;
    } else {
      return;
    }
    onChange(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(newPos, newPos);
    });
  }, [value, onChange]);

  const handleClear = useCallback(() => {
    onChange("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [onChange]);

  const handleEnter = useCallback(() => {
    onEnter?.();
  }, [onEnter]);

  // Desktop-only live preview of what is typed, as real maths. If the text
  // can't be converted it simply shows nothing; the input itself is untouched.
  let previewTex = "";
  if (value.trim()) {
    try { previewTex = exprToLatex(value); } catch { previewTex = ""; }
  }

  return (
    <div className="space-y-1">
      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(normalizeMathInput(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && onEnter?.()}
          placeholder={placeholder}
          className={cn("font-mono text-sm flex-1 h-12 rounded-xl bg-black/[0.03] text-base dark:bg-black/25", className)}
          /* Suppress native keyboard on mobile when our keypad is open */
          inputMode={showKeypad ? "none" : undefined}
        />
        {withKeypad && (
          <button
            type="button"
            onClick={() => setShowKeypad((v) => !v)}
            aria-label={showKeypad ? "Hide math keypad" : "Show math keypad"}
            title={showKeypad ? "Hide math keypad" : "Show math keypad"}
            className={cn(
              "shrink-0 h-12 w-12 rounded-xl border flex items-center justify-center transition-all",
              showKeypad
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-muted/60 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
            )}
          >
            <Keyboard className="h-4 w-4" />
          </button>
        )}
      </div>

      {previewTex && (
        <div className="math-preview flex items-center gap-3 px-1 pt-2 text-lg overflow-x-auto">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground shrink-0">Preview</span>
          <MathTex latex={previewTex} />
        </div>
      )}

      {withKeypad && showKeypad && (
        <MathKeypad
          onInput={insertAtCursor}
          onBackspace={handleBackspace}
          onClear={handleClear}
          onEnter={handleEnter}
        />
      )}
    </div>
  );
}
