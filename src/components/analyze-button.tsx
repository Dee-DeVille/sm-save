import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
    status: string;
    handleFetch: () => void;
    url: string;
    isAnalyzed?: boolean;
};

/**
 * The read control. Kept as a quiet outline control so the ochre record control
 * remains the only primary action on the faceplate.
 */
export default function AnalyzeButton({ status, handleFetch, url, isAnalyzed }: Props) {
    const isAnalyzing = status === "analyzing";
    const isDownloading = status === "downloading";
    const isDisabled = !url || isAnalyzing || isDownloading || isAnalyzed;

    return (
        <Button
            variant="outline"
            onClick={handleFetch}
            disabled={isDisabled}
            className="h-11 w-33 shrink-0 gap-2 text-xs"
        >
            {isAnalyzing ? (
                <>
                    <Loader2 className="size-4 animate-spin text-ink-muted" />
                    <span>Reading…</span>
                </>
            ) : isAnalyzed ? (
                <>
                    <span className="size-1.5 rounded-full bg-led shadow-[0_0_6px_var(--led)]" />
                    <span>Read</span>
                </>
            ) : (
                <>
                    <span className={cn("size-1.5 rounded-full", isDisabled ? "bg-led-dim" : "bg-ochre shadow-[0_0_6px_var(--ochre)]")} />
                    <span>Analyze</span>
                </>
            )}
        </Button>
    );
}
