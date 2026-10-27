import { invoke } from "@tauri-apps/api/core";
import { Button } from "./ui/button";
import LevelMeter, { type MeterMode } from "./meter";
import { cn } from "@/lib/utils";

type Props = {
    status: "idle" | "analyzing" | "downloading" | "success" | "error";
    currentLog: string;
    duration: string | null;
    elapsedTime: number;
    progress: number;
    isPlaylist: boolean;
    ready?: boolean;
    handleStop: () => void;
    handleNewDownload: () => void;
    formatDuration: (duration: number) => string;
}

export default function ProgressCard({ status, currentLog, duration, elapsedTime, progress, isPlaylist, ready, handleStop, handleNewDownload, formatDuration }: Props) {
    const handleOpenDownloads = async () => {
        try {
            await invoke("open_download_folder");
        } catch (error) {
            console.error("Failed to open directory:", error);
        }
    };

    const mode: MeterMode =
        status === "success" ? "done" : status === "analyzing" ? "search" : status === "downloading" ? "play" : "halt";

    const ledClass =
        status === "success"
            ? "bg-led shadow-[0_0_6px_var(--led)]"
            : status === "error"
                ? "bg-record shadow-[0_0_6px_var(--record)]"
                : status === "analyzing"
                    ? "bg-led-amber animate-pulse shadow-[0_0_6px_var(--led-amber)]"
                    : status === "downloading"
                        ? "bg-led animate-pulse shadow-[0_0_6px_var(--led)]"
                        : "bg-led-dim";

    const headline =
        status === "success"
            ? isPlaylist ? "Playlist written to disk" : "Written to disk"
            : status === "error"
                ? currentLog || "Transport fault"
                : status === "analyzing"
                    ? "Reading source…"
                    : status === "downloading"
                        ? currentLog || "Writing to disk"
                        : ready
                            ? "Ready — press Download"
                            : "Standby — waiting for a link";

    const timeReadout = status === "idle"
        ? "—"
        : status === "success" && duration
            ? `Took ${duration}`
            : status === "analyzing"
                ? "—"
                : formatDuration(elapsedTime);

    const percent = status === "idle" ? "—" : status === "success" ? "100" : String(Math.round(progress));

    return (
        <div className="tape-in">
            <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className={cn("size-1.5 shrink-0 rounded-full", ledClass)} />
                    <span
                        className={cn(
                            "truncate text-[11px] font-medium",
                            status === "error" ? "text-record" : "text-ink"
                        )}
                        title={currentLog}
                    >
                        {headline}
                    </span>
                </div>
                <span className="tnum shrink-0 font-mono text-[10px] text-ink-faint">{timeReadout}</span>
            </div>

            <div className="well mt-2 flex items-center gap-3 px-3 py-2">
                <LevelMeter value={progress} mode={mode} className="flex-1" />
                <span className="tnum w-9 shrink-0 text-right font-mono text-[10px] text-ink-faint">
                    {status === "idle" ? "—" : `${percent}%`}
                </span>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2">
                <span className="silkscreen">
                    {status === "analyzing" ? "Search" : status === "success" ? "Complete" : status === "error" ? "Halted" : "Progress"}
                </span>

                <div className="flex items-center gap-1.5">
                    {(status === "downloading" || status === "analyzing") && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleStop}
                            className="h-6 px-2.5 text-[11px]"
                        >
                            Stop
                        </Button>
                    )}

                    {(status === "success" || status === "error") && (
                        <>
                            {status === "success" && (
                                <Button onClick={handleOpenDownloads} size="sm" variant="outline" className="h-6 px-2.5 text-[11px]">
                                    Open folder
                                </Button>
                            )}
                            <Button onClick={handleNewDownload} size="sm" variant="ghost" className="h-6 px-2.5 text-[11px]">
                                Dismiss
                            </Button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
