import { cn } from "@/lib/utils";

const SEGMENTS = 32;

export type MeterMode = "play" | "search" | "done" | "halt";

type Props = {
    value: number;
    mode: MeterMode;
    className?: string;
    label?: string;
};

/**
 * Segmented LED level meter. Zones run green → amber → record red, the way a
 * deck's meter is scaled, so a nearly-finished download visibly approaches peak.
 */
export default function LevelMeter({ value, mode, className, label }: Props) {
    const clamped = Math.min(100, Math.max(0, value));
    const lit = mode === "done" ? SEGMENTS : mode === "play" ? Math.round((clamped / 100) * SEGMENTS) : 0;

    return (
        <div
            className={cn("flex h-4.5 items-stretch gap-0.75", className)}
            role="progressbar"
            aria-label={label ?? "Download level"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={mode === "done" ? 100 : Math.round(clamped)}
        >
            {Array.from({ length: SEGMENTS }, (_, i) => {
                const isLit = i < lit;
                const zone = (i + 1) / SEGMENTS;
                const tone = zone > 0.875 ? "var(--record)" : zone > 0.7 ? "var(--led-amber)" : "var(--led)";

                return (
                    <span
                        key={i}
                        className={cn("flex-1 rounded-[1px] transition-colors duration-200", !isLit && "bg-led-dim")}
                        style={
                            mode === "search"
                                ? {
                                      backgroundColor: tone,
                                      animation: `meter-chase 1.5s ${(i % 8) * 70}ms infinite`,
                                  }
                                : isLit
                                  ? {
                                        backgroundColor: tone,
                                        boxShadow: `0 0 7px -1px ${tone}`,
                                    }
                                  : undefined
                        }
                    />
                );
            })}
        </div>
    );
}
