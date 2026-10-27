import { getAppVersion } from "@/lib/get-app-version";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import UpdateDialog, { type YtDlpUpdateInfo } from "./update-dialog";
import { ArrowDownCircle } from "lucide-react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";

export default function AppVersion() {
    const [appVersion, setAppVersion] = useState("");
    const [isUpdateDialogOpen, setIsUpdateDialogOpen] = useState(false);
    const [checkedOnStartup, setCheckedOnStartup] = useState(false);
    const [hasUpdate, setHasUpdate] = useState(false);
    const [initialAppUpdate, setInitialAppUpdate] = useState<Update | null>(null);
    const [initialYtdlpInfo, setInitialYtdlpInfo] = useState<YtDlpUpdateInfo | null>(null);

    useEffect(() => {
        getAppVersion().then((version) => {
            setAppVersion(version);
        });

        let isMounted = true;

        async function checkForUpdatesSilently() {
            try {
                const [appRes, ytdlpRes] = await Promise.allSettled([
                    check(),
                    invoke<YtDlpUpdateInfo>("check_ytdlp_update"),
                ]);

                const appUp = appRes.status === "fulfilled" ? appRes.value : null;
                const ytdlpUp = ytdlpRes.status === "fulfilled" ? ytdlpRes.value : null;

                const hasAppUpdate = Boolean(appUp);
                const hasYtdlpUpdate = Boolean(ytdlpUp?.update_available);

                if (isMounted) {
                    if (appUp) setInitialAppUpdate(appUp);
                    if (ytdlpUp) setInitialYtdlpInfo(ytdlpUp);

                    const foundUpdate = hasAppUpdate || hasYtdlpUpdate;
                    setHasUpdate(foundUpdate);
                    setCheckedOnStartup(true);
                }
            } catch (err) {
                console.debug("Silent startup update check error:", err);
                if (isMounted) setCheckedOnStartup(true);
            }
        }

        const timer = setTimeout(() => {
            checkForUpdatesSilently();
        }, 1200);

        return () => {
            isMounted = false;
            clearTimeout(timer);
        };
    }, []);

    const handleOpenInstagram = () => {
        openUrl("https://www.instagram.com/dee.deville");
    };

    const buttonLabel = hasUpdate
        ? "Updates available"
        : checkedOnStartup
        ? "Check updates"
        : "Updates";

    return (
        <>
            <div className="flex items-center justify-center gap-2.5 px-5 py-2.5 text-[10px] text-ink-faint select-none">
                <span className="tnum font-mono">v{appVersion}</span>
                <span aria-hidden className="h-2.5 w-px bg-edge" />
                <button
                    onClick={() => setIsUpdateDialogOpen(true)}
                    className={cn(
                        "flex cursor-pointer items-center gap-1 transition-colors",
                        hasUpdate
                            ? "font-medium text-ochre hover:text-ink"
                            : "hover:text-ink"
                    )}
                    title={hasUpdate ? "Software updates are available" : "Check for software updates"}
                >
                    <ArrowDownCircle className={cn("size-3", hasUpdate && "animate-bounce text-ochre")} />
                    <span>{buttonLabel}</span>
                </button>
                <span aria-hidden className="h-2.5 w-px bg-edge" />
                <button
                    onClick={handleOpenInstagram}
                    className="flex cursor-pointer items-center gap-1 transition-colors hover:text-ink"
                    title="Follow Dee on Instagram"
                >
                    <svg
                        className="size-3 fill-current"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                    </svg>
                    <span>Dee</span>
                </button>
            </div>
            <UpdateDialog
                isOpen={isUpdateDialogOpen}
                onClose={() => setIsUpdateDialogOpen(false)}
                appVersion={appVersion}
                onUpdateStatusChange={(hasAny) => {
                    setHasUpdate(hasAny);
                    if (!hasAny) {
                        setInitialAppUpdate(null);
                        setInitialYtdlpInfo(null);
                    }
                }}
                initialAppUpdate={initialAppUpdate}
                initialYtdlpInfo={initialYtdlpInfo}
            />
        </>
    );
}