import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import {
    RefreshCw,
    Download,
    Loader2,
    Sparkles,
    X,
    ArrowUpCircle,
    Cpu,
    AppWindow
} from "lucide-react";

export type YtDlpUpdateInfo = {
    current_version: string;
    latest_version: string;
    update_available: boolean;
    active_path: string;
};

type Props = {
    isOpen: boolean;
    onClose: () => void;
    appVersion: string;
    onUpdateStatusChange?: (hasUpdate: boolean) => void;
    initialAppUpdate?: Update | null;
    initialYtdlpInfo?: YtDlpUpdateInfo | null;
};

export default function UpdateDialog({
    isOpen,
    onClose,
    appVersion,
    onUpdateStatusChange,
    initialAppUpdate,
    initialYtdlpInfo,
}: Props) {
    // App updater states
    const [checkingApp, setCheckingApp] = useState(false);
    const [appUpdate, setAppUpdate] = useState<Update | null>(null);
    const [appUpdateDownloaded, setAppUpdateDownloaded] = useState(false);
    const [appDownloadProgress, setAppDownloadProgress] = useState(0);
    const [appInstalling, setAppInstalling] = useState(false);
    const [appStatusText, setAppStatusText] = useState("");

    // yt-dlp updater states
    const [checkingYtdlp, setCheckingYtdlp] = useState(false);
    const [updatingYtdlp, setUpdatingYtdlp] = useState(false);
    const [ytdlpInfo, setYtdlpInfo] = useState<YtDlpUpdateInfo | null>(null);
    const [ytdlpStatusText, setYtdlpStatusText] = useState("");

    useEffect(() => {
        if (isOpen) {
            const hasInitialUpdates = Boolean(initialAppUpdate || initialYtdlpInfo?.update_available);
            if (hasInitialUpdates) {
                if (initialAppUpdate) {
                    setAppUpdate(initialAppUpdate);
                    setAppStatusText(`Version ${initialAppUpdate.version} is available!`);
                } else {
                    setAppUpdate(null);
                    setAppStatusText("You are on the latest version.");
                }

                if (initialYtdlpInfo) {
                    setYtdlpInfo(initialYtdlpInfo);
                    if (initialYtdlpInfo.update_available) {
                        setYtdlpStatusText(`Update available: ${initialYtdlpInfo.latest_version}`);
                    } else {
                        setYtdlpStatusText("yt-dlp is up to date.");
                    }
                }
            } else {
                handleCheckAll();
            }
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && onUpdateStatusChange) {
            const hasAny = Boolean(appUpdate || ytdlpInfo?.update_available);
            onUpdateStatusChange(hasAny);
        }
    }, [isOpen, appUpdate, ytdlpInfo?.update_available, onUpdateStatusChange]);

    const handleCheckAll = () => {
        checkAppUpdate();
        checkYtdlpUpdate();
    };

    const checkAppUpdate = async () => {
        setCheckingApp(true);
        setAppStatusText("Checking GitHub for app updates...");
        try {
            const update = await check();
            if (update) {
                setAppUpdate(update);
                setAppStatusText(`Version ${update.version} is available!`);
            } else {
                setAppUpdate(null);
                setAppStatusText("You are on the latest version.");
            }
        } catch (err: any) {
            console.warn("App update check error:", err);
            setAppStatusText(String(err?.message || err).slice(0, 100));
        } finally {
            setCheckingApp(false);
        }
    };

    const installAppUpdate = async () => {
        if (!appUpdate) return;
        setAppInstalling(true);
        setAppStatusText("Downloading update package...");
        try {
            let downloaded = 0;
            let total = 0;
            await appUpdate.downloadAndInstall((event) => {
                switch (event.event) {
                    case "Started":
                        total = event.data.contentLength || 0;
                        break;
                    case "Progress":
                        downloaded += event.data.chunkLength;
                        if (total > 0) {
                            setAppDownloadProgress(Math.round((downloaded / total) * 100));
                        }
                        break;
                    case "Finished":
                        setAppDownloadProgress(100);
                        setAppUpdateDownloaded(true);
                        setAppStatusText("Update downloaded! Restarting...");
                        break;
                }
            });
            await relaunch();
        } catch (err: any) {
            console.error("Failed to install app update:", err);
            setAppStatusText(`Update error: ${err?.message || err}`);
            setAppInstalling(false);
        }
    };

    const checkYtdlpUpdate = async () => {
        setCheckingYtdlp(true);
        setYtdlpStatusText("Checking latest yt-dlp upstream release...");
        try {
            const info = await invoke<YtDlpUpdateInfo>("check_ytdlp_update");
            setYtdlpInfo(info);
            if (info.update_available) {
                setYtdlpStatusText(`Update available: ${info.latest_version}`);
            } else {
                setYtdlpStatusText("yt-dlp engine is up to date.");
            }
        } catch (err: any) {
            console.error("yt-dlp check error:", err);
            setYtdlpStatusText(String(err).slice(0, 100));
        } finally {
            setCheckingYtdlp(false);
        }
    };

    const installYtdlpUpdate = async () => {
        setUpdatingYtdlp(true);
        setYtdlpStatusText("Downloading latest binary from GitHub...");
        try {
            const newVer = await invoke<string>("install_ytdlp_update");
            setYtdlpStatusText(`Successfully updated to ${newVer}!`);
            await checkYtdlpUpdate();
        } catch (err: any) {
            console.error("Failed to update yt-dlp:", err);
            setYtdlpStatusText(`Failed to update: ${String(err).slice(0, 100)}`);
        } finally {
            setUpdatingYtdlp(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px] animate-in fade-in duration-150">
            <div className="plate relative w-full max-w-lg space-y-4 p-5">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-line/70 pb-3">
                    <div className="flex items-center gap-2">
                        <ArrowUpCircle className="size-4 text-ochre" />
                        <h2 className="condensed text-[16px] font-semibold tracking-tight text-ink-strong">Updates</h2>
                    </div>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="cursor-pointer rounded-md p-1 text-ink-faint transition-colors hover:bg-muted hover:text-ink"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="space-y-2.5">
                    {/* SM-SAVE application */}
                    <div className="well p-3.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2.5">
                                <div className="rounded-md border border-edge bg-face-raised p-1.5 text-ink-muted">
                                    <AppWindow className="size-3.5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[12px] font-semibold text-ink">SM-SAVE</span>
                                        <span className="tnum rounded border border-edge px-1 font-mono text-[9px] text-ink-faint">
                                            v{appVersion || "0.2.1"}
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-[10.5px] text-ink-muted">{appStatusText || "Checking…"}</p>
                                </div>
                            </div>

                            <div className="shrink-0">
                                {appUpdate ? (
                                    <Button
                                        size="sm"
                                        onClick={installAppUpdate}
                                        disabled={appInstalling}
                                        className="h-7 gap-1.5 text-[11px]"
                                    >
                                        {appInstalling ? (
                                            <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                            <Download className="size-3.5" />
                                        )}
                                        {appUpdateDownloaded ? "Restarting…" : "Update & restart"}
                                    </Button>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={checkAppUpdate}
                                        disabled={checkingApp}
                                        className="h-7 gap-1.5 text-[11px]"
                                    >
                                        <RefreshCw className={`size-3.5 ${checkingApp ? "animate-spin" : ""}`} />
                                        Check
                                    </Button>
                                )}
                            </div>
                        </div>

                        {appInstalling && (
                            <div className="mt-3 space-y-1.5">
                                <div className="flex justify-between font-mono text-[10px] text-ink-faint">
                                    <span>Downloading package</span>
                                    <span className="tnum">{appDownloadProgress}%</span>
                                </div>
                                <Progress value={appDownloadProgress} className="h-1.5" />
                            </div>
                        )}
                    </div>

                    {/* yt-dlp engine */}
                    <div className="well p-3.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-2.5">
                                <div className="rounded-md border border-edge bg-face-raised p-1.5 text-ink-muted">
                                    <Cpu className="size-3.5" />
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[12px] font-semibold text-ink">yt-dlp</span>
                                        {ytdlpInfo?.current_version && (
                                            <span className="tnum rounded border border-edge px-1 font-mono text-[9px] text-ink-faint">
                                                {ytdlpInfo.current_version}
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-0.5 text-[10.5px] text-ink-muted">{ytdlpStatusText || "Checking…"}</p>
                                </div>
                            </div>

                            <div className="shrink-0">
                                <Button
                                    size="sm"
                                    onClick={installYtdlpUpdate}
                                    disabled={updatingYtdlp || checkingYtdlp}
                                    className="h-7 gap-1.5 text-[11px]"
                                    variant={ytdlpInfo?.update_available ? "default" : "outline"}
                                >
                                    {updatingYtdlp ? (
                                        <Loader2 className="size-3.5 animate-spin" />
                                    ) : ytdlpInfo?.update_available ? (
                                        <Sparkles className="size-3.5" />
                                    ) : (
                                        <RefreshCw className="size-3.5" />
                                    )}
                                    {ytdlpInfo?.update_available ? "Update yt-dlp" : "Re-check"}
                                </Button>
                            </div>
                        </div>
                        <p className="mt-2.5 border-t border-line/60 pt-2 text-[10px] leading-relaxed text-ink-faint">
                            Updating yt-dlp fixes extractor breakage — YouTube algorithm changes and the like — without reinstalling SM-SAVE.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-1.5 border-t border-line/70 pt-3">
                    <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-[11px]">
                        Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
