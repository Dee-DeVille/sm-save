import { invoke } from "@tauri-apps/api/core";
import { getBrowserFlags, needsYouTubeCookies, isYouTube, getBrowserDisplayName, SupportedBrowser } from "./browser-flags";

type Props = {
    url: string;
    isPlaylist: boolean;
    useBrowserContext: boolean;
    selectedBrowser?: SupportedBrowser;
    bearerToken: string;
    referer: string;
    setStatus: (status: "idle" | "analyzing" | "downloading" | "success" | "error") => void;
    setCurrentLog: (log: string) => void;
    setAvailableFormats: (formats: any[]) => void;
    setSelectedFormat: (format: string) => void;
    setIsAnalyzed: (analyzed: boolean) => void;
    setVideoInfo: (info: { title?: string, thumbnail?: string, uploader?: string, duration?: number }) => void;
    setPlaylistItems: (items: { index: number, title: string, duration?: number }[]) => void;
    setSelectedItems: (items: number[]) => void;
    childRef: React.RefObject<any>;
    pidRef?: React.RefObject<number | null>;
    manualStopRef?: React.RefObject<boolean>;
    limitPlaylist: boolean;
}

async function runYtDlpDumpJson(
    url: string,
    isPlaylist: boolean,
    extraFlags: string[],
    _childRef: React.RefObject<any>,
    _pidRef?: React.RefObject<number | null>,
    limitPlaylist: boolean = true,
): Promise<{ jsonStr: string; errorStr: string }> {
    const playlistEnd = limitPlaylist ? ["--playlist-end", "50"] : [];
    const args = isPlaylist
        ? ["--dump-json", "--flat-playlist", ...playlistEnd, ...extraFlags, url.trim()]
        : ["--dump-json", "--no-playlist", "--playlist-items", "1", ...extraFlags, url.trim()];

    try {
        const output = await invoke<{ stdout: string; stderr: string; code: number }>(
            "run_ytdlp_dump",
            { args }
        );
        return { jsonStr: output.stdout, errorStr: output.stderr };
    } catch (err: any) {
        return { jsonStr: "", errorStr: String(err) };
    }
}
function parseAndApply(
    jsonStr: string,
    isPlaylist: boolean,
    limitPlaylist: boolean,
    props: Props,
): { success: boolean; message: string } {
    if (props.manualStopRef?.current) return { success: false, message: "" };

    const {
        setAvailableFormats, setSelectedFormat, setIsAnalyzed,
        setVideoInfo, setPlaylistItems, setSelectedItems,
    } = props;

    const lines = jsonStr.trim().split("\n").filter(Boolean);
    if (lines.length === 0) return { success: false, message: "" };

    if (isPlaylist) {
        let entries: any[] = [];
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed && typeof parsed === "object") {
                    entries.push(parsed);
                }
            } catch {
                // Ignore warning logs or non-JSON stdout lines
            }
        }

        if (entries.length === 0) {
            return { success: false, message: "No playlist items could be parsed." };
        }

        const totalFound = entries.length;
        if (limitPlaylist && entries.length > 50) entries = entries.slice(0, 50);

        const items = entries.map((e: any, i: number) => ({
            index: i + 1,
            title: e.title || "Unknown Title",
            duration: e.duration,
        }));

        if (props.manualStopRef?.current) return { success: false, message: "" };

        setPlaylistItems(items);
        setSelectedItems(items.map((i: any) => i.index));
        setVideoInfo({
            title: entries[0].playlist_title || entries[0].title || "Playlist",
            uploader: entries[0].uploader || entries[0].channel,
        });
        setIsAnalyzed(true);

        const msg = limitPlaylist && totalFound > 50
            ? `Found ${totalFound} videos. Limited to the first 50.`
            : `Found ${items.length} videos.`;
        return { success: true, message: msg };
    } else {
        let metadata: any = null;
        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed && typeof parsed === "object" && (parsed.id || parsed.title || parsed.formats)) {
                    metadata = parsed;
                    break;
                }
            } catch {
                // Ignore non-JSON lines
            }
        }

        if (!metadata) {
            return { success: false, message: "Failed to parse video metadata." };
        }

        const hasVideo = metadata.formats?.some(
            (f: any) => f.vcodec && f.vcodec !== "none"
        );
        const hasAudio = metadata.formats?.some(
            (f: any) => f.acodec && f.acodec !== "none"
        );
        if (!hasVideo && !hasAudio) {
            return { success: false, message: "This URL does not contain downloadable media." };
        }

        if (props.manualStopRef?.current) return { success: false, message: "" };

        setVideoInfo({
            title: metadata.title,
            thumbnail: metadata.thumbnail,
            uploader: metadata.uploader,
            duration: metadata.duration,
        });

        if (metadata.formats && Array.isArray(metadata.formats)) {
            const formats = metadata.formats
                .filter((f: any) => f.vcodec && f.vcodec !== "none" && f.height)
                .map((f: any) => ({
                    id: f.format_id,
                    height: f.height,
                    fps: f.fps,
                    ext: f.ext,
                    note: f.format_note || (f.fps ? `${f.fps}fps` : ""),
                    isDirect: f.protocol === "https" || f.protocol === "http",
                }))
                .sort((a: any, b: any) => {
                    if (b.height !== a.height) return b.height - a.height;
                    if ((b.fps || 0) !== (a.fps || 0)) return (b.fps || 0) - (a.fps || 0);
                    if (b.isDirect !== a.isDirect) return b.isDirect ? 1 : -1;
                    return 0;
                })
                .filter((v: any, i: number, a: any[]) =>
                    a.findIndex((t: any) => t.height === v.height && (t.fps === v.fps || !t.fps)) === i)
                .map(({ isDirect, ...rest }: any) => rest);

            setAvailableFormats(formats);
            if (formats.length > 0) {
                setSelectedFormat(formats[0].id);
                setIsAnalyzed(true);
                return { success: true, message: `Found ${formats.length} quality options.` };
            }
        } else {
            setAvailableFormats([]);
            setSelectedFormat("best");
        }

        setIsAnalyzed(true);
        return { success: true, message: "" };
    }
}

export const fetchMetadata = async (props: Props) => {
    const {
        url, isPlaylist, useBrowserContext, selectedBrowser = "chrome", bearerToken, referer,
        setStatus, setCurrentLog,
        setAvailableFormats, setSelectedFormat, setIsAnalyzed,
        childRef, pidRef, manualStopRef,
        limitPlaylist,
    } = props;

    if (!url || manualStopRef?.current) return;

    const browserName = getBrowserDisplayName(selectedBrowser);

    setStatus("analyzing");
    setCurrentLog(isPlaylist ? "Fetching playlist items..." : "Fetching available qualities...");

    const yt = isYouTube(url);
    const flags1 = getBrowserFlags(url, useBrowserContext, bearerToken, referer, false, selectedBrowser);
    const { jsonStr: json1, errorStr: err1 } = await runYtDlpDumpJson(url, isPlaylist, flags1, childRef, pidRef, limitPlaylist);

    if (manualStopRef?.current) return;

    if (json1.trim()) {
        try {
            const { success, message } = parseAndApply(json1, isPlaylist, limitPlaylist, props);
            if (manualStopRef?.current) return;
            if (success) {
                setStatus("idle");
                setCurrentLog(message);
                return;
            }
            setStatus("error");
            setCurrentLog(message || "This URL does not contain downloadable media.");
            return;
        } catch {
        }
        if (manualStopRef?.current) return;
        setAvailableFormats([]);
        setSelectedFormat("best");
        setStatus("idle");
        setIsAnalyzed(true);
        setCurrentLog("Direct stream or un-parsable format detected.");
        return;
    }
    if (manualStopRef?.current) return;
    if (yt && useBrowserContext && needsYouTubeCookies(err1)) {
        setCurrentLog("Video may be private or age-restricted — retrying with browser cookies...");

        const flags2 = getBrowserFlags(url, useBrowserContext, bearerToken, referer, true, selectedBrowser);
        const { jsonStr: json2, errorStr: err2 } = await runYtDlpDumpJson(url, isPlaylist, flags2, childRef, pidRef, limitPlaylist);

        if (manualStopRef?.current) return;

        if (json2.trim()) {
            try {
                const { success, message } = parseAndApply(json2, isPlaylist, limitPlaylist, props);
                if (manualStopRef?.current) return;
                if (success) {
                    setStatus("idle");
                    setCurrentLog(message);
                    return;
                }
                setStatus("error");
                setCurrentLog(message || "This URL does not contain downloadable media.");
                return;
            } catch { /* fall through */ }

            if (manualStopRef?.current) return;
            setAvailableFormats([]);
            setSelectedFormat("best");
            setStatus("idle");
            setIsAnalyzed(true);
            setCurrentLog("Direct stream or un-parsable format detected.");
            return;
        }
        if (manualStopRef?.current) return;
        const cookieErr = err2.toLowerCase();
        if (cookieErr.includes("database is locked") || cookieErr.includes("unable to open")) {
            setCurrentLog(`Cookie error: close ${browserName} completely and try again.`);
        } else if (cookieErr.includes("sign in") || cookieErr.includes("private")) {
            setCurrentLog("This video is private or requires a Google account login.");
        } else if (cookieErr.includes("javascript runtime") || cookieErr.includes("no supported javascript")) {
            setCurrentLog("JavaScript runtime required for YouTube. Check your internet connection to complete setup.");
        } else {
            setCurrentLog("Analysis failed even with cookies. The video may be unavailable.");
        }
        setStatus("error");
        return;
    }
    if (manualStopRef?.current) return;
    const e = err1.toLowerCase();
    if (e.includes("cookies") || e.includes("database is locked")) {
        setCurrentLog(`Cookie error: close ${browserName} completely and try again.`);
    } else if (e.includes("403")) {
        setCurrentLog("Access denied (403): check your token or referer.");
    } else if (e.includes("private") || e.includes("login")) {
        setCurrentLog("This content is private or requires login.");
    } else if (e.includes("javascript runtime") || e.includes("no supported javascript")) {
        setCurrentLog("JavaScript runtime required for YouTube. Check your internet connection to complete setup.");
    } else if (err1.trim()) {
        setCurrentLog(err1.trim().slice(0, 150));
    } else {
        setCurrentLog("Analysis failed. Enable browser context or check the URL.");
    }
    setStatus("error");
};