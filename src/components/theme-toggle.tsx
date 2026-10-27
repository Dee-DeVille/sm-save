import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Theme } from "@/lib/theme";

type Props = {
    theme: Theme;
    onChange: (theme: Theme) => void;
};

/**
 * Two-position rocker switch, mounted in a recessed well to match the keys.
 */
export default function ThemeToggle({ theme, onChange }: Props) {
    const isDark = theme === "dark";

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isDark}
            aria-label={isDark ? "Graphite finish. Switch to aluminium" : "Aluminium finish. Switch to graphite"}
            title={isDark ? "Aluminium finish" : "Graphite finish"}
            onClick={() => onChange(isDark ? "light" : "dark")}
            className="well relative flex h-7 w-14.5 shrink-0 cursor-pointer items-center justify-between px-1.75"
        >
            <span
                aria-hidden
                className={cn(
                    "absolute top-0.75 left-0.75 h-4.5 w-6 rounded-md border border-edge bg-face-raised",
                    "shadow-[inset_0_1px_0_var(--line-hi),0_1px_2px_rgb(0_0_0/0.28)]",
                    "transition-transform duration-200 ease-out",
                    isDark && "translate-x-6.75"
                )}
            />
            <Sun
                aria-hidden
                className={cn("relative z-10 size-3 transition-colors", isDark ? "text-ink-faint" : "text-ochre")}
            />
            <Moon
                aria-hidden
                className={cn("relative z-10 size-3 transition-colors", isDark ? "text-ochre" : "text-ink-faint")}
            />
        </button>
    );
}
