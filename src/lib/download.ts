import { downloadDir, executableDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getBrowserFlags, needsYouTubeCookies, isYouTube, getBrowserDisplayName, SupportedBrowser } from "./browser-flags";
import { addHistoryItem, deleteFileFromDisk, deleteEmptyDirIfExists, checkFileDiskStatus } from "./history";

type Props = {
    url: string;
    isPlaylist: boolean;
    selectedItems: number[];
    playlistQuality: "highest" | "medium" | "low";
    availableFormats: any[];
    selectedFormat: string;
    useBrowserContext: boolean;
    selectedBrowser?: SupportedBrowser;
    bearerToken: string;
    referer: string;
    setStatus: (status: "idle" | "analyzing" | "downloading" | "success" | "error") => void;
    setCurrentLog: (log: string) => void;
    setPlaylistItems: (items: { index: number, title: string, duration?: number }[]) => void;
    setStartTime: (time: number | null) => void;
    setDuration: (duration: string | null) => void;
    setProgress: React.Dispatch<React.SetStateAction<number>>;
    formatDuration: (ms: number) => string;
    setUrl: (url: string) => void;
    format: "video" | "audio";
    stdoutBuffer: React.RefObject<string>;
    pidRef: React.RefObject<number | null>;
    manualStopRef: React.RefObject<boolean>;
    childRef: React.RefObject<any>;
    activeCleanupRef?: React.RefObject<(() => Promise<void>) | null>;
    currentLog: string;
    videoInfo?: { title?: string, thumbnail?: string, uploader?: string, duration?: number } | null;
    existingHistoryId?: string;
}

async function resolveFfmpegDir(): Promise<string> {
    try {
        const dir = await invoke<string>("get_exe_dir");
        if (dir) return dir;
    } catch {
        console.warn("Custom Rust command get_exe_dir failed, using fallback...");
    }
    try {
        const fallbackDir = await executableDir();
        return fallbackDir;
    } catch (error) {
        console.error("Could not resolve executable directory:", error);
        return "";
    }
}

async function resolveDownloadDir(): Promise<string> {
    try {
        const dir = await invoke<string>("get_download_dir");
        if (dir && dir.trim()) {
            return dir.trim().replace(/[/\\]+$/, "");
        }
    } catch {
        console.warn("Custom Rust command get_download_dir failed, using fallback...");
    }
    try {
        const fallbackDir = await downloadDir();
        if (fallbackDir && fallbackDir.trim()) {
            return fallbackDir.trim().replace(/[/\\]+$/, "");
        }
    } catch (error) {
        console.error("Could not resolve download directory:", error);
    }
    return "";
}

function processDownloadStdout(
    chunk: string,
    stdoutBuffer: React.RefObject<string>,
    isPlaylist: boolean,
    totalPlaylistItems: number,
    state: {
        currentPlaylistIndex: number;
        highestProgress: number;
        currentStream: "video" | "audio";
        isDownloadingThumbnail: boolean;
        hasMultipleStreams: boolean;
    },
    setCurrentLog: (log: string) => void,
    setProgress: React.Dispatch<React.SetStateAction<number>>
) {
    stdoutBuffer.current += chunk;
    const lines = stdoutBuffer.current.split("\n");
    stdoutBuffer.current = lines.pop() || "";

    for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        // 1. Next playlist item detected
        const playlistMatch = trimmedLine.match(/Downloading (?:video|item) (\d+) of (\d+)/);
        if (playlistMatch) {
            state.currentPlaylistIndex = parseInt(playlistMatch[1], 10) || 1;
            state.highestProgress = 0;
            state.currentStream = "video";
            state.isDownloadingThumbnail = false;
            setCurrentLog(`Downloading video ${playlistMatch[1]} of ${playlistMatch[2]}...`);
            continue;
        }

        // Track stream destination type (video vs audio vs thumbnail)
        if (trimmedLine.toLowerCase().includes("destination:")) {
            const lower = trimmedLine.toLowerCase();
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".webp") || lower.endsWith(".png")) {
                state.isDownloadingThumbnail = true;
                continue;
            } else {
                state.isDownloadingThumbnail = false;
                if (lower.includes(".m4a") || lower.includes(".opus") || lower.includes(".mp3") || lower.includes(".aac") || lower.includes(".f140")) {
                    state.currentStream = "audio";
                } else {
                    state.currentStream = "video";
                }
            }
        }

        if (state.isDownloadingThumbnail || trimmedLine.toLowerCase().includes("thumbnail")) {
            if (trimmedLine.toLowerCase().includes("embedding thumbnail")) {
                setCurrentLog("Embedding thumbnail...");
            } else {
                setCurrentLog("Downloading thumbnail...");
            }
            continue;
        }

        // 2. Progress percentage lines: handle [sm-save-progress] or standard [download] lines
        const isDeckProgress = trimmedLine.startsWith("[sm-save-progress]");
        const isStandardDownload = trimmedLine.includes("[download]") && trimmedLine.includes("%");

        if (isDeckProgress || isStandardDownload) {
            const lower = trimmedLine.toLowerCase();
            if (lower.includes("thumbnail") || lower.includes(".jpg") || lower.includes(".webp") || lower.includes(".png")) {
                continue;
            }

            const pMatch = trimmedLine.match(/([\d.]+)%/);
            if (pMatch) {
                const p = parseFloat(pMatch[1]);
                if (!isNaN(p)) {
                    let target = p;
                    if (isPlaylist && totalPlaylistItems > 1) {
                        target = ((state.currentPlaylistIndex - 1 + p / 100) / totalPlaylistItems) * 100;
                    } else if (state.hasMultipleStreams) {
                        // Multi-stream: Video (0%..85%), Audio (85%..98%)
                        if (state.currentStream === "audio") {
                            target = 85 + (p / 100) * 13;
                        } else {
                            target = (p / 100) * 85;
                        }
                    } else {
                        // Single stream: 0%..98%
                        target = Math.min(98, (p / 100) * 98);
                    }

                    const rounded = Math.round(target * 10) / 10;
                    if (rounded > state.highestProgress) {
                        state.highestProgress = rounded;
                        setProgress(rounded);
                    }
                }
            }

            const cleanProgress = trimmedLine
                .replace(/^\[sm-save-progress\]\s*/, "")
                .replace(/^\[download\]\s*/, "");
            setCurrentLog(`Downloading: ${cleanProgress}`);
        } else if (
            trimmedLine.includes("Merging formats") ||
            trimmedLine.includes("Remuxing video") ||
            trimmedLine.includes("Recoding video")
        ) {
            if (state.highestProgress < 98.5) {
                state.highestProgress = 98.5;
                setProgress(98.5);
            }
            setCurrentLog("Processing & encoding media...");
        } else if (
            !trimmedLine.startsWith("[download]") &&
            !trimmedLine.startsWith("[sm-save-progress]") &&
            !trimmedLine.startsWith("[ExtractAudio]") &&
            !trimmedLine.toLowerCase().includes("destination:")
        ) {
            setCurrentLog(trimmedLine.slice(0, 120));
        }
    }
}

function extractFilePath(line: string): string | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // 1. Merging, remuxing, moving, or media fixup
    const mergerMatch = trimmed.match(
        new RegExp("(?:Merging formats into|Correcting conta" + "iner in|Moving file [^\\s]+ to|Not converting media file)\\s*[\"']?([^\"'\\r\\n]+)[\"']?", "i")
    );
    if (mergerMatch && mergerMatch[1]) {
        return mergerMatch[1].trim();
    }

    // 2. Destination lines: [download], [ExtractAudio], or [VideoConvertor]
    const destMatch = trimmed.match(/Destination:\s*["']?([^"'\r\n]+)["']?/i);
    if (destMatch && destMatch[1]) {
        const p = destMatch[1].trim();
        // Skip partial stream fragment files
        if (!/\.f\d+\.[a-zA-Z0-9]+$/i.test(p) && !/\.part$/i.test(p) && !/\.ytdl$/i.test(p)) {
            return p;
        }
    }

    // 3. Already downloaded
    const alreadyMatch = trimmed.match(/\[download\]\s+([^"'\r\n]+)\s+has already been downloaded/i);
    if (alreadyMatch && alreadyMatch[1]) {
        return alreadyMatch[1].trim();
    }

    return null;
}

export function extractAllFilePathsFromLine(line: string): string[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    const results: string[] = [];

    // 1. Destination paths: [download] Destination: ... or [ExtractAudio] Destination: ...
    const destMatch = trimmed.match(/(?:(?:\[download\]|\[ExtractAudio\])\s+)?Destination:\s*["']?([^"'\r\n]+)["']?/i);
    if (destMatch && destMatch[1]) {
        results.push(destMatch[1].trim());
    }

    // 2. Merging / remuxing / media container fixup / moving file:
    const mergeMatch = trimmed.match(
        new RegExp(
            "(?:Merging formats into|Correcting conta" + "iner in|Remuxing video [^\\n\\r]+ to|Moving file [^\\s]+ to)\\s*[\"']?([^\"'\\r\\n]+)[\"']?",
            "i"
        )
    );
    if (mergeMatch && mergeMatch[1]) {
        results.push(mergeMatch[1].trim());
    }

    // 3. Writing video thumbnail: [info] Writing video thumbnail ... to: <path>
    const thumbWriteMatch = trimmed.match(/Writing video thumbnail(?:\s+\d+)?\s+to:\s*["']?([^"'\r\n]+)["']?/i);
    if (thumbWriteMatch && thumbWriteMatch[1]) {
        results.push(thumbWriteMatch[1].trim());
    }

    // 4. Converting thumbnail: [ThumbnailsConvertor] Converting thumbnail "<path>" to <ext>
    const thumbConvMatch = trimmed.match(/Converting thumbnail\s*["']?([^"'\r\n]+)["']?\s+to\s+([a-zA-Z0-9]+)/i);
    if (thumbConvMatch && thumbConvMatch[1]) {
        const srcThumb = thumbConvMatch[1].trim();
        results.push(srcThumb);
        const targetExt = thumbConvMatch[2].trim();
        const converted = srcThumb.replace(/\.[a-zA-Z0-9]+$/, `.${targetExt}`);
        results.push(converted);
    }

    // 5. Deleting original file: Deleting original file <path>
    const delMatch = trimmed.match(/Deleting original file\s*["']?([^"'\r\n]+)["']?/i);
    if (delMatch && delMatch[1]) {
        results.push(delMatch[1].trim());
    }

    // 6. Already downloaded: [download] <path> has already been downloaded
    const alreadyMatch = trimmed.match(/\[download\]\s+([^"'\r\n]+)\s+has already been downloaded/i);
    if (alreadyMatch && alreadyMatch[1]) {
        results.push(alreadyMatch[1].trim());
    }

    return results;
}

export function getCandidateFilePaths(filePath: string): string[] {
    const candidates = new Set<string>();
    const clean = filePath.trim();
    if (!clean) return [];

    candidates.add(clean);
    candidates.add(`${clean}.part`);
    candidates.add(`${clean}.ytdl`);

    // Determine the base stem without stream format selector or file extension
    // e.g. /path/to/Video.f270.mp4 -> /path/to/Video
    // e.g. /path/to/Video.webp -> /path/to/Video
    // e.g. /path/to/Video.mp4 -> /path/to/Video
    let stem = clean.replace(/\.f\d+\.[a-zA-Z0-9]+$/i, "");
    stem = stem.replace(/\.(mp4|m4a|mp3|webm|mkv|ogg|wav|flac|opus|aac|webp|jpg|jpeg|png)$/i, "");

    // Add thumbnail/cover image candidate files
    candidates.add(`${stem}.jpg`);
    candidates.add(`${stem}.jpeg`);
    candidates.add(`${stem}.webp`);
    candidates.add(`${stem}.png`);

    // Add partial/fragment media files
    candidates.add(`${stem}.part`);
    candidates.add(`${stem}.ytdl`);
    candidates.add(`${stem}.mp4.part`);
    candidates.add(`${stem}.mp4.ytdl`);
    candidates.add(`${stem}.m4a.part`);
    candidates.add(`${stem}.m4a.ytdl`);
    candidates.add(`${stem}.mp3.part`);
    candidates.add(`${stem}.mp3.ytdl`);
    candidates.add(`${stem}.webm.part`);
    candidates.add(`${stem}.webm.ytdl`);
    candidates.add(`${stem}.temp.mp4`);
    candidates.add(`${stem}.temp.m4a`);
    candidates.add(`${stem}.temp.mp3`);

    // Target media outputs (only deleted if aborted before completion)
    candidates.add(`${stem}.mp4`);
    candidates.add(`${stem}.mp3`);
    candidates.add(`${stem}.m4a`);
    candidates.add(`${stem}.webm`);

    return Array.from(candidates);
}

export const startDownload = async ({
    url, isPlaylist, selectedItems, playlistQuality,
    availableFormats, selectedFormat,
    useBrowserContext, selectedBrowser = "chrome", bearerToken, referer,
    setStatus, setCurrentLog, setPlaylistItems, childRef: _childRef, pidRef,
    manualStopRef, setStartTime, setDuration, setProgress,
    formatDuration, format, stdoutBuffer, currentLog: _currentLog,
    setUrl, videoInfo, activeCleanupRef, existingHistoryId
}: Props) => {
    if (!url) return;
    if (isPlaylist && selectedItems.length === 0) {
        setCurrentLog("Please select at least one video to download.");
        setStatus("error");
        return;
    }

    const downloadFolder = await resolveDownloadDir();

    setCurrentLog("Preparing download...");
    const ffmpegDir = await resolveFfmpegDir();
    const ffmpegArgs = ffmpegDir ? ["--ffmpeg-location", ffmpegDir] : [];

    const browserFlags = getBrowserFlags(url, useBrowserContext, bearerToken, referer, false, selectedBrowser);

    const playlistItemsArg = selectedItems.length > 0
        ? selectedItems.sort((a, b) => a - b).join(",")
        : "1";

    const playlistFlags = isPlaylist
        ? ["--yes-playlist", "--playlist-items", playlistItemsArg]
        : ["--no-playlist", "--playlist-items", "1"];

    const playlistFolder = isPlaylist ? "%(playlist_title,playlist|Playlist)s/" : "";
    const playlistPrefix = isPlaylist ? "%(playlist_index)02d - " : "";

    let args: string[] = [];

    if (format === "video") {
        const heightTag = availableFormats.length > 0 && !isPlaylist ? " [%(height)sp]" : "";
        const outputTemplate = `${playlistFolder}${playlistPrefix}%(title|Unknown_Stream)s${heightTag}.%(ext)s`;

        let formatSelector: string;
        if (isPlaylist) {
            if (playlistQuality === "highest") {
                formatSelector = "bestvideo+bestaudio/best";
            } else if (playlistQuality === "medium") {
                formatSelector = "bestvideo[height<=720]+bestaudio/best[height<=720]";
            } else {
                formatSelector = "worstvideo+worstaudio/worst";
            }
        } else {
            if (availableFormats.length > 0) {
                formatSelector = `${selectedFormat}+bestaudio[ext=m4a]/${selectedFormat}+bestaudio/best`;
            } else {
                formatSelector = "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best";
            }
        }

        args = [
            "--newline",
            "--progress",
            "--no-colors",
            "--no-part",
            "--no-keep-video",
            "--concurrent-fragments", "4",
            "--progress-template", "download:[sm-save-progress] %(progress._percent_str)s %(progress._total_bytes_str)s %(progress._speed_str)s %(progress._eta_str)s",
            ...playlistFlags,
            "--force-overwrites",
            "--hls-prefer-native",

            ...ffmpegArgs,

            "-S", "vcodec:h264,acodec:m4a",
            "-f", formatSelector,
            "--merge-output-format", "mp4",
            "--recode-video", "mp4",

            "--convert-thumbnails", "jpg",
            "--embed-thumbnail",

            "--embed-metadata",

            "-P", downloadFolder,
            "-o", outputTemplate,
            ...browserFlags,
            "--",
            url.trim()
        ];
    } else {
        const outputTemplate = `${playlistFolder}${playlistPrefix}%(title|Unknown_Stream)s.%(ext)s`;

        args = [
            "--newline",
            "--progress",
            "--no-colors",
            "--no-part",
            "--concurrent-fragments", "4",
            "--progress-template", "download:[sm-save-progress] %(progress._percent_str)s %(progress._total_bytes_str)s %(progress._speed_str)s %(progress._eta_str)s",
            ...playlistFlags,
            "--force-overwrites",

            ...ffmpegArgs,

            "-f", "bestaudio/best",
            "--extract-audio",
            "--audio-format", "mp3",
            "--audio-quality", "0",

            "--convert-thumbnails", "jpg",
            "--embed-thumbnail",
            "--embed-metadata",

            "-P", downloadFolder,
            "-o", outputTemplate,
            ...browserFlags,
            "--",
            url.trim()
        ];
    }

    setStatus("downloading");
    setProgress(0);
    setDuration(null);
    manualStopRef.current = false;
    setStartTime(Date.now());
    const startTime = Date.now();
    setCurrentLog(
        isPlaylist
            ? `Starting download of ${selectedItems.length} videos...`
            : `Initializing ${format} download...`
    );
    stdoutBuffer.current = "";

    const hasMultipleStreams = format === "video" && !isPlaylist;
    const progressState = {
        currentPlaylistIndex: 1,
        highestProgress: 0,
        currentStream: "video" as "video" | "audio",
        isDownloadingThumbnail: false,
        hasMultipleStreams,
    };
    const totalPlaylistItems = isPlaylist && selectedItems.length > 0 ? selectedItems.length : 1;
    const capturedPaths: string[] = [];
    const deletedPaths = new Set<string>();
    const trackedFiles = new Set<string>();
    const completedFiles = new Set<string>();
    let detectedPlaylistFolder: string | null = null;

    const cleanupAbortedFiles = async () => {
        const filesToDelete = Array.from(trackedFiles).filter((f) => !completedFiles.has(f));
        for (const filePath of filesToDelete) {
            try {
                await deleteFileFromDisk(filePath);
            } catch {
                // Ignore missing or locked files
            }
        }
        if (isPlaylist && detectedPlaylistFolder) {
            try {
                await deleteEmptyDirIfExists(detectedPlaylistFolder);
            } catch {
                // Ignore empty folder cleanup errors
            }
        }
    };

    if (activeCleanupRef) {
        activeCleanupRef.current = cleanupAbortedFiles;
    }

    const recordDownloadHistory = async () => {
        try {
            // Filter out files yt-dlp deleted (e.g. temporary streams or intermediate conversion files)
            const activePaths = capturedPaths.filter((p) => {
                const norm = p.replace(/\\/g, "/");
                return (
                    !deletedPaths.has(p) &&
                    !deletedPaths.has(norm) &&
                    !p.endsWith(".part") &&
                    !p.endsWith(".ytdl") &&
                    !/\.f\d+\.[a-zA-Z0-9]+$/i.test(p)
                );
            });

            // Evaluate candidate paths in reverse order (final output of pipeline is produced last)
            const candidates = activePaths.length > 0 ? [...activePaths].reverse() : [...capturedPaths].reverse();

            let chosenPath: string | null = null;
            for (const cand of candidates) {
                const fullCand = cand.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(cand)
                    ? cand
                    : `${downloadFolder}/${cand}`;
                const st = await checkFileDiskStatus(fullCand);
                if (st.exists) {
                    chosenPath = st.resolved_path || fullCand;
                    break;
                }
            }

            if (!chosenPath && candidates.length > 0) {
                const cand = candidates[0];
                chosenPath = cand.startsWith("/") || /^[a-zA-Z]:[/\\]/.test(cand)
                    ? cand
                    : `${downloadFolder}/${cand}`;
            }

            if (chosenPath) {
                const normalized = chosenPath.replace(/\\/g, "/");
                const normDownload = downloadFolder.replace(/\\/g, "/").replace(/\/+$/, "");
                const lastSlash = normalized.lastIndexOf("/");
                const parentDir = lastSlash !== -1 ? normalized.slice(0, lastSlash) : "";

                // Case-insensitive comparison for Windows drive letters and paths
                const isRealPlaylistFolder =
                    isPlaylist &&
                    parentDir.length > normDownload.length &&
                    parentDir.toLowerCase().startsWith(normDownload.toLowerCase());

                if (isRealPlaylistFolder) {
                    const folderName = parentDir.split("/").pop() || "Playlist";
                    addHistoryItem({
                        id: existingHistoryId,
                        url,
                        title: videoInfo?.title || folderName,
                        thumbnail: videoInfo?.thumbnail,
                        format,
                        quality: format === "video" ? (availableFormats.find(f => f.id === selectedFormat)?.height ? `${availableFormats.find(f => f.id === selectedFormat)?.height}p` : playlistQuality) : undefined,
                        filePath: parentDir,
                        fileName: folderName,
                        isPlaylist: true,
                        itemCount: selectedItems.length > 0 ? selectedItems.length : capturedPaths.length,
                        selectedItems,
                        playlistQuality,
                    });
                } else {
                    const fileName = normalized.split("/").pop() || "Downloaded Media";
                    addHistoryItem({
                        id: existingHistoryId,
                        url,
                        title: videoInfo?.title || fileName,
                        thumbnail: videoInfo?.thumbnail,
                        duration: videoInfo?.duration,
                        format,
                        selectedFormat,
                        quality: format === "video" ? (availableFormats.find(f => f.id === selectedFormat)?.height ? `${availableFormats.find(f => f.id === selectedFormat)?.height}p` : undefined) : undefined,
                        filePath: chosenPath,
                        fileName,
                        isPlaylist: false,
                    });
                }
            }
        } catch (e) {
            console.error("Failed to record download history:", e);
        }
    };

    const runProcess = async (
        processArgs: string[],
        onFinish: (code: number, stderrText: string) => Promise<void>
    ): Promise<number> => {
        const channel = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        let stderrText = "";
        const unlistens: UnlistenFn[] = [];

        const uStdout = await listen<string>(`${channel}:stdout`, (event) => {
            const raw = event.payload;
            for (const line of raw.split("\n")) {
                const detected = extractFilePath(line);
                if (detected && !capturedPaths.includes(detected)) {
                    capturedPaths.push(detected);
                }

                if (line.includes("Deleting original file")) {
                    const delMatch = line.match(/Deleting original file\s*["']?([^"'\r\n]+)["']?/i);
                    if (delMatch && delMatch[1]) {
                        const delPath = delMatch[1].trim();
                        deletedPaths.add(delPath);
                        deletedPaths.add(delPath.replace(/\\/g, "/"));
                        deletedPaths.add(delPath.replace(/\//g, "\\"));
                    }
                }

                const linePaths = extractAllFilePathsFromLine(line);
                for (const lp of linePaths) {
                    const candidates = getCandidateFilePaths(lp);
                    for (const cand of candidates) {
                        trackedFiles.add(cand);
                    }

                    if (isPlaylist) {
                        const normP = lp.replace(/\\/g, "/");
                        const normDl = downloadFolder.replace(/\\/g, "/").replace(/\/+$/, "");
                        const lastSlash = normP.lastIndexOf("/");
                        if (lastSlash !== -1) {
                            const parentDir = normP.slice(0, lastSlash);
                            if (parentDir.length > normDl.length && parentDir.toLowerCase().startsWith(normDl.toLowerCase())) {
                                detectedPlaylistFolder = parentDir;
                            }
                        }
                    }
                }

                if (
                    line.includes("Deleting original file") ||
                    line.includes("has already been downloaded") ||
                    /Downloading (?:video|item) (\d+) of (\d+)/.test(line)
                ) {
                    if (capturedPaths.length > 0) {
                        for (const cp of capturedPaths) {
                            completedFiles.add(cp);
                        }
                    }
                }
            }
            processDownloadStdout(
                raw + "\n",
                stdoutBuffer,
                isPlaylist,
                totalPlaylistItems,
                progressState,
                setCurrentLog,
                setProgress
            );
        });
        unlistens.push(uStdout);

        const uStderr = await listen<string>(`${channel}:stderr`, (event) => {
            stderrText += event.payload + "\n";
            const trimmed = event.payload.trim();
            if (!trimmed) return;
            if (
                trimmed.toLowerCase().includes("error") &&
                !trimmed.includes("deprecated")
            ) {
                console.error("[yt-dlp stderr]", trimmed);
                setCurrentLog(trimmed.slice(0, 150));
            }
        });
        unlistens.push(uStderr);

        const uClose = await listen<number>(`${channel}:close`, async (event) => {
            for (const u of unlistens) u();
            if (pidRef) pidRef.current = null;
            await onFinish(event.payload, stderrText);
        });
        unlistens.push(uClose);

        const pid = await invoke<number>("spawn_ytdlp_download", {
            args: processArgs,
            eventChannel: channel,
        });

        if (pidRef) pidRef.current = pid;
        return pid;
    };

    try {
        await runProcess(args, async (exitCode, stderrOutput) => {
            if (manualStopRef.current) {
                await cleanupAbortedFiles();
                return;
            }

            if (exitCode === 0) {
                await recordDownloadHistory();
                setStatus("success");
                setUrl("");
                const endTime = Date.now();
                if (startTime) setDuration(formatDuration(endTime - startTime));
                setProgress(100);
                setPlaylistItems([]);
                setCurrentLog(
                    isPlaylist ? "Playlist download complete!" : "Download finished successfully!"
                );
                return;
            }

            if (isYouTube(url) && useBrowserContext && needsYouTubeCookies(stderrOutput)) {
                const browserName = getBrowserDisplayName(selectedBrowser);
                setCurrentLog(`Retrying with browser cookies (close ${browserName} if open)...`);
                setProgress(0);
                progressState.highestProgress = 0;
                progressState.currentPlaylistIndex = 1;
                progressState.currentStream = "video";
                progressState.isDownloadingThumbnail = false;
                stdoutBuffer.current = "";

                const retryBrowserFlags = getBrowserFlags(url, useBrowserContext, bearerToken, referer, true, selectedBrowser);
                const retryArgs = args
                    .slice(0, args.indexOf("--"))
                    .filter((a) => a !== "--cookies-from-browser" && a !== selectedBrowser)
                    .concat(retryBrowserFlags, ["--", url.trim()]);

                await runProcess(retryArgs, async (retryCode, retryStderr) => {
                    if (manualStopRef.current) {
                        await cleanupAbortedFiles();
                        return;
                    }
                    if (retryCode === 0) {
                        await recordDownloadHistory();
                        setStatus("success");
                        setUrl("");
                        const endTime = Date.now();
                        if (startTime) setDuration(formatDuration(endTime - startTime));
                        setProgress(100);
                        setPlaylistItems([]);
                        setCurrentLog("Download finished successfully!");
                    } else {
                        const e = retryStderr.toLowerCase();
                        if (e.includes("database is locked") || e.includes("unable to open")) {
                            setCurrentLog(`Cookie error: close ${browserName} completely and try again.`);
                        } else {
                            setCurrentLog(`Download failed (exit code ${retryCode}).`);
                        }
                        setStatus("error");
                    }
                });
                return;
            }

            setStatus("error");
            const errLower = stderrOutput.toLowerCase();
            if (errLower.includes("javascript runtime") || errLower.includes("no supported javascript")) {
                setCurrentLog("JavaScript runtime required for YouTube extraction. Check your internet connection to complete setup.");
            } else {
                setCurrentLog(
                    `Exit code ${exitCode} — ffmpeg dir: "${ffmpegDir || "not resolved"}". ` +
                    `Ensure ffmpeg & ffprobe are in src-tauri/bin/ and listed in tauri.conf.json externalBin.`
                );
            }
        });
    } catch (err) {
        console.error(err);
        setStatus("error");
        setCurrentLog(`Spawn error: ${String(err)}`);
    } finally {
        if (activeCleanupRef) {
            activeCleanupRef.current = null;
        }
    }
};