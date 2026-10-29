import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, User } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { invoke } from "@tauri-apps/api/core";
import { cn } from "@/lib/utils";
import { fetchMetadata } from "./lib/fetch-meta";
import { startDownload } from "./lib/download";
import ProgressCard from "./components/progress";
import PlaylistItem from "./components/playlist-item";
import BrowserHeader from "./components/browser-header";
import DownloadButton from "./components/download-button";
import AnalyzeButton from "./components/analyze-button";
import SelectPlaylist from "./components/select-playlist";
import AppVersion from "./components/app-version";
import DownloadHistory from "./components/download-history";
import ThemeToggle from "./components/theme-toggle";
import WindowControls from "./components/window-controls";
import { openUrl } from "@tauri-apps/plugin-opener";
import { DownloadHistoryItem, checkFileDiskStatus } from "./lib/history";
import { SupportedBrowser, SUPPORTED_BROWSERS } from "./lib/browser-flags";
import { Theme, applyTheme, resolveInitialTheme } from "./lib/theme";

type DeckFormat = "video" | "audio";

/** Two-position input selector, lit by an LED on the engaged side. */
function InputSelect({ format, onChange }: { format: DeckFormat; onChange: (format: DeckFormat) => void }) {
  return (
    <div className="well flex h-8 items-center gap-0.5 p-0.5">
      {(["video", "audio"] as const).map((option) => {
        const isActive = format === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={isActive}
            className={cn(
              "flex h-full cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 text-[11px] font-medium capitalize transition-colors",
              isActive
                ? "bg-face-raised text-ink shadow-[inset_0_1px_0_var(--line-hi),0_1px_1px_rgb(0_0_0/0.25)]"
                : "text-ink-muted hover:text-ink"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full transition-colors",
                isActive ? "bg-led shadow-[0_0_6px_var(--led)]" : "bg-led-dim"
              )}
            />
            {option}
          </button>
        );
      })}
    </div>
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<DeckFormat>("video");
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [useBrowserContext, setUseBrowserContext] = useState(false);
  const [selectedBrowser, setSelectedBrowser] = useState<SupportedBrowser>(() => {
    const saved = localStorage.getItem("sm-save_browser") as SupportedBrowser | null;
    return (saved && SUPPORTED_BROWSERS.some((b) => b.id === saved)) ? saved : "chrome";
  });
  const [status, setStatus] = useState<"idle" | "analyzing" | "downloading" | "success" | "error">("idle");
  const [progress, setProgress] = useState(0);
  const [currentLog, setCurrentLog] = useState("");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [availableFormats, setAvailableFormats] = useState<any[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>("best");
  const [isAnalyzed, setIsAnalyzed] = useState(false);
  const [videoInfo, setVideoInfo] = useState<{ title?: string, thumbnail?: string, uploader?: string, duration?: number } | null>(null);
  const [playlistQuality, setPlaylistQuality] = useState<"highest" | "medium" | "low">("highest");
  const [playlistItems, setPlaylistItems] = useState<{ index: number, title: string, duration?: number }[]>([]);
  const [limitPlaylist, setLimitPlaylist] = useState(true);
  const [selectedItems, setSelectedItems] = useState<number[]>([]);
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());

  const childRef = useRef<any>(null);
  const stdoutBuffer = useRef("");
  const manualStopRef = useRef(false);
  const pidRef = useRef<number | null>(null);
  const activeCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const [bearerToken, setBearerToken] = useState("");
  const [referer, setReferer] = useState("");

  const handleBrowserChange = (browser: SupportedBrowser) => {
    setSelectedBrowser(browser);
    localStorage.setItem("sm-save_browser", browser);
  };

  const handleThemeChange = (next: Theme) => {
    setTheme(next);
    applyTheme(next);
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === "downloading" && startTime) {
      interval = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 1000);
    } else if (status !== "downloading") {
      setElapsedTime(0);
    }
    return () => clearInterval(interval);
  }, [status, startTime]);

  const formatDuration = (ms: number) => {
    if (!ms) return "";
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };


  async function handleFetch() {
    manualStopRef.current = false;
    setPlaylistItems([]);
    setProgress(0);
    setIsAnalyzed(false);
    setVideoInfo(null);
    setAvailableFormats([]);
    await fetchMetadata({
      url,
      isPlaylist,
      setAvailableFormats,
      setStatus,
      setCurrentLog,
      setVideoInfo,
      setPlaylistItems,
      setSelectedItems,
      setIsAnalyzed, setSelectedFormat, childRef, pidRef,
      manualStopRef,
      useBrowserContext, selectedBrowser, bearerToken, referer, limitPlaylist
    })
  }
  async function handleDownload() {
    setProgress(0);
    await startDownload({
      url,
      isPlaylist,
      selectedItems,
      playlistQuality,
      availableFormats,
      selectedFormat,
      setStatus,
      setCurrentLog,
      setPlaylistItems,
      setStartTime,
      setDuration,
      setProgress,
      formatDuration,
      setUrl,
      childRef,
      pidRef,
      manualStopRef,
      activeCleanupRef,
      currentLog, format, stdoutBuffer,
      useBrowserContext, selectedBrowser, bearerToken, referer,
      videoInfo
    })
  }
  const handleStop = async () => {
    manualStopRef.current = true;
    const wasAnalyzing = status === "analyzing";
    try {
      const pidToKill = pidRef.current ?? 0;
      await invoke("kill_process", { pid: pidToKill });
      pidRef.current = null;
      if (childRef.current) {
        await childRef.current.kill();
        childRef.current = null;
      }
    } catch (err) {
      console.error("Failed to stop:", err);
    }

    // Immediately clean up any partial fragments and cover images from the aborted session
    if (activeCleanupRef.current) {
      try {
        await activeCleanupRef.current();
      } catch (err) {
        console.error("Failed to cleanup aborted files:", err);
      }
      activeCleanupRef.current = null;
    }

    setStatus("idle");
    setProgress(0);
    setCurrentLog(wasAnalyzing ? "Analysis stopped." : "Download stopped.");
    setIsAnalyzed(false);
    setPlaylistItems([]);
    setVideoInfo(null);
    setAvailableFormats([]);
  };

  const handleNewDownload = () => {
    setUrl("");
    setAvailableFormats([]);
    setIsAnalyzed(false);
    setIsPlaylist(false);
    setStartTime(null);
    setVideoInfo(null);
    setDuration(null);
    setPlaylistItems([]);
    setSelectedItems([]);
    setProgress(0);
    setStatus("idle");
  };

  /** Cancels a source that has been analysed but not started, returning the deck to standby. */
  const handleCancelAnalysis = () => {
    handleNewDownload();
    setCurrentLog("");
  };

  const handleRedownload = async (item: DownloadHistoryItem) => {
    if (item.filePath) {
      try {
        const disk = await checkFileDiskStatus(item.filePath);
        if (disk.exists) {
          setCurrentLog("File already exists on disk. Re-download skipped.");
          return;
        }
      } catch {
        // ignore check error
      }
    }

    setProgress(0);
    setUrl(item.url);
    setFormat(item.format);
    setIsPlaylist(item.isPlaylist);
    if (item.isPlaylist) {
      if (item.selectedItems) setSelectedItems(item.selectedItems);
      if (item.playlistQuality) setPlaylistQuality(item.playlistQuality);
    } else {
      if (item.selectedFormat) setSelectedFormat(item.selectedFormat);
    }
    setVideoInfo({
      title: item.title,
      thumbnail: item.thumbnail,
      duration: item.duration,
    });
    await startDownload({
      url: item.url,
      isPlaylist: item.isPlaylist,
      selectedItems: item.selectedItems || [],
      playlistQuality: item.playlistQuality || "highest",
      availableFormats: [],
      selectedFormat: item.selectedFormat || "best",
      setStatus,
      setCurrentLog,
      setPlaylistItems,
      setStartTime,
      setDuration,
      setProgress,
      formatDuration,
      setUrl,
      childRef,
      pidRef,
      manualStopRef,
      activeCleanupRef,
      currentLog: "",
      format: item.format,
      stdoutBuffer,
      useBrowserContext,
      selectedBrowser,
      bearerToken,
      referer,
      videoInfo: {
        title: item.title,
        thumbnail: item.thumbnail,
        duration: item.duration,
      },
      existingHistoryId: item.id,
    });
  };

  const hasPlaylistId = url.includes("list=") || url.includes("/playlist");

  // Header readout mirrors the transport: one word, one lamp.
  const deckState =
    status === "analyzing"
      ? { label: "Reading", led: "bg-led-amber shadow-[0_0_6px_var(--led-amber)]" }
      : status === "downloading"
        ? { label: "Writing", led: "bg-led animate-pulse shadow-[0_0_6px_var(--led)]" }
        : status === "success"
          ? { label: "Done", led: "bg-led shadow-[0_0_6px_var(--led)]" }
          : status === "error"
            ? { label: "Fault", led: "bg-record shadow-[0_0_6px_var(--record)]" }
            : isAnalyzed
              ? { label: "Ready", led: "bg-led shadow-[0_0_6px_var(--led)]" }
              : { label: "Standby", led: "bg-led-dim" };

  return (
    <div className="flex min-h-dvh flex-col bg-desk">
      <div className="plate flex min-h-dvh w-full flex-col overflow-hidden">
        <h1 className="sr-only">SM-SAVE — A Media Downloader</h1>

        {/* Model plate: identity, tagline, transport readout, finish, window keys */}
        <header
          data-tauri-drag-region
          className="flex items-center justify-between gap-3 px-5 pt-2.5 pb-3"
        >
          <div data-tauri-drag-region className="flex items-center gap-2.5">
            <img
              data-tauri-drag-region
              src="/icon.png"
              alt=""
              draggable={false}
              className="size-7 shrink-0 rounded-[6px]"
            />
            <div data-tauri-drag-region className="flex flex-col gap-1">
              <span data-tauri-drag-region className="condensed text-[16px] font-bold tracking-[0.16em] text-ink-strong">
                SM-SAVE
              </span>
              <span data-tauri-drag-region className="font-mono text-[10px] tracking-[0.02em] text-ink-muted">
                A Media Downloader
              </span>
            </div>
          </div>

          <div data-tauri-drag-region className="flex items-center gap-2.5">
            <div className="well flex h-7 items-center gap-2 px-2.5">
              <span className={cn("size-1.5 shrink-0 rounded-full", deckState.led)} />
              <span className="tnum truncate font-mono text-[10px] font-semibold tracking-[0.145em] text-ink uppercase">{deckState.label}</span>
            </div>
            <ThemeToggle theme={theme} onChange={handleThemeChange} />
            <span aria-hidden className="h-5 w-px bg-line" />
            <WindowControls />
          </div>
        </header>

        {/* Source loading */}
        <section className="engrave px-5 pt-4 pb-4">
          <span className="silkscreen">Paste source</span>


          <div className="mt-2 flex items-stretch gap-2">
            <Input
              placeholder="Paste media or playlist link..."
              value={url}
              onChange={(e) => {
                const val = e.target.value;
                setUrl(val);
                setAvailableFormats([]);
                setIsAnalyzed(false);
                setStartTime(null);
                setDuration(null);
                setVideoInfo(null);
                setPlaylistItems([]);
                setSelectedItems([]);
                setProgress(0);
                setStatus("idle");
                setIsPlaylist(false);
              }}
              disabled={status === "downloading" || status === "analyzing"}
              className="h-11 flex-1"
            />
            <AnalyzeButton
              status={status}
              handleFetch={handleFetch}
              url={url}
              isAnalyzed={isAnalyzed}
            />
          </div>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() =>
                void openUrl("https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md")
              }
              title="The full list of sites handled by the bundled yt-dlp. Some sites need cookies, a login or a non-blocked region — use a browser session for those."
              className="cursor-pointer font-mono text-[10px] tracking-[0.08em] text-ink-muted underline decoration-dotted underline-offset-2 transition-colors hover:text-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-strong"
            >
              Supported Sites
            </button>
            <span aria-hidden className="text-ink-muted/50">·</span>
            <span className="font-mono text-[10px] tracking-[0.02em] text-ink-muted/70">
              YouTube · Instagram · TikTok · X · and 1,800 more
            </span>
          </div>

          <div className="mt-3 space-y-2">
            <BrowserHeader
              setIsAnalyzed={setIsAnalyzed}
              useBrowserContext={useBrowserContext}
              setUseBrowserContext={setUseBrowserContext}
              selectedBrowser={selectedBrowser}
              setSelectedBrowser={handleBrowserChange}
              bearerToken={bearerToken}
              setBearerToken={setBearerToken}
              referer={referer}
              setReferer={setReferer}
              status={status}
              setPlaylistItems={setPlaylistItems}
            />
            {hasPlaylistId && (
              <SelectPlaylist
                setLimitPlaylist={setLimitPlaylist}
                isPlaylist={isPlaylist}
                setIsPlaylist={setIsPlaylist}
                status={status}
                setAvailableFormats={setAvailableFormats}
                setIsAnalyzed={setIsAnalyzed}
                setVideoInfo={setVideoInfo}
                setPlaylistItems={setPlaylistItems}
              />
            )}
          </div>
        </section>

        {/* Analysed source, presented as the tape's label */}
        {videoInfo && !isPlaylist && status !== "downloading" && status !== "success" && (
          <section className="engrave px-5 py-4">
            <div className="tape-in flex gap-3">
              <div className="relative h-19 w-34 shrink-0 overflow-hidden rounded-lg border border-edge bg-well">
                {videoInfo.thumbnail ? (
                  <img
                    src={videoInfo.thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Loader2 className="size-5 animate-spin text-ink-faint" />
                  </div>
                )}
                {videoInfo.duration ? (
                  <span className="tnum absolute right-1 bottom-1 rounded-sm bg-black/75 px-1.5 py-0.5 font-mono text-[10px] text-white">
                    {formatDuration(videoInfo.duration * 1000)}
                  </span>
                ) : null}
              </div>

              <div className="flex min-w-0 flex-1 flex-col">
                <span className="silkscreen">Label</span>
                <h2
                  className="condensed mt-1 line-clamp-2 text-[19px] font-semibold leading-[1.15] text-ink-strong"
                  title={videoInfo.title}
                >
                  {videoInfo.title || "Unknown source"}
                </h2>
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-ink-muted">
                  {videoInfo.uploader && (
                    <span className="flex min-w-0 items-center gap-1">
                      <User className="size-3 shrink-0" />
                      <span className="truncate">{videoInfo.uploader}</span>
                    </span>
                  )}
                  {videoInfo.duration ? (
                    <span className="tnum flex shrink-0 items-center gap-1">
                      <Clock className="size-3 shrink-0" />
                      {formatDuration(videoInfo.duration * 1000)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
              <span className="silkscreen mr-0.5">Input</span>
              <InputSelect format={format} onChange={setFormat} />

              <span className="silkscreen ml-1 mr-0.5">Quality</span>
              {format === "video" ? (
                availableFormats.length > 0 ? (
                  <Select value={selectedFormat} onValueChange={setSelectedFormat}>
                    <SelectTrigger className="h-8 min-w-32 text-[11px]">
                      <SelectValue placeholder="Select quality" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableFormats.map((f) => (
                        <SelectItem key={f.id} value={f.id} className="text-[11px]">
                          {f.height}p ({f.ext}) {f.note}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="tnum flex h-8 items-center rounded-lg border border-edge bg-well px-2.5 font-mono text-[10px] text-ink-muted">
                    Best available
                  </span>
                )
              ) : (
                <span className="tnum flex h-8 items-center rounded-lg border border-edge bg-well px-2.5 font-mono text-[10px] text-ink-muted">
                  MP3 · 320 kbps
                </span>
              )}

              <div className="ml-auto">
                <DownloadButton isPlaylist={isPlaylist} selectedItems={selectedItems} status={status} handleDownload={handleDownload} url={url} />
              </div>
            </div>
          </section>
        )}

        {/* Playlist reel */}
        {isPlaylist && playlistItems.length > 0 && status !== "downloading" && status !== "success" && (
          <section className="engrave px-5 py-4">
            <div className="tape-in flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="silkscreen">Reel</span>
                  <h2 className="condensed mt-1 truncate text-[17px] font-semibold leading-tight text-ink-strong" title={videoInfo?.title}>
                    {videoInfo?.title || "Playlist"}
                  </h2>
                  <p className="tnum mt-0.5 font-mono text-[10px] text-ink-muted">
                    {selectedItems.length} of {playlistItems.length} selected
                  </p>
                </div>
                <InputSelect format={format} onChange={setFormat} />
              </div>

              {format === "video" ? (
                <div className="flex items-center gap-2">
                  <span className="silkscreen shrink-0">Quality</span>
                  <div className="well flex flex-1 items-center gap-0.5 p-0.5">
                    {([
                      { id: "highest", label: "Highest" },
                      { id: "medium", label: "720p" },
                      { id: "low", label: "Low" },
                    ] as const).map((q) => {
                      const isActive = playlistQuality === q.id;
                      return (
                        <button
                          key={q.id}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => setPlaylistQuality(q.id)}
                          className={cn(
                            "flex h-6 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] text-[11px] font-medium transition-colors",
                            isActive
                              ? "bg-face-raised text-ink shadow-[inset_0_1px_0_var(--line-hi),0_1px_1px_rgb(0_0_0/0.25)]"
                              : "text-ink-muted hover:text-ink"
                          )}
                        >
                          <span
                            className={cn(
                              "size-1.5 rounded-full transition-colors",
                              isActive ? "bg-led shadow-[0_0_6px_var(--led)]" : "bg-led-dim"
                            )}
                          />
                          {q.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="flex h-8 items-center justify-between rounded-lg border border-edge bg-well px-2.5">
                  <span className="text-[11px] text-ink-muted">Audio extraction</span>
                  <span className="tnum font-mono text-[10px] text-ink-faint">All tracks · MP3 320</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-2.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    if (selectedItems.length === playlistItems.length) setSelectedItems([]);
                    else setSelectedItems(playlistItems.map(i => i.index));
                  }}
                >
                  {selectedItems.length === playlistItems.length ? "Deselect all" : "Select all"}
                </Button>
                <DownloadButton isPlaylist={isPlaylist} selectedItems={selectedItems} status={status} handleDownload={handleDownload} url={url} />
              </div>

              <div className="well max-h-64 overflow-y-auto p-1">
                {playlistItems.map(item => (
                  <PlaylistItem key={item.index} item={item} selectedItems={selectedItems} setSelectedItems={setSelectedItems} formatDuration={formatDuration} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Transport status and level meter — always on the faceplate */}
        <section className="engrave px-5 py-3">
          <ProgressCard ready={isAnalyzed} status={status} currentLog={currentLog} duration={duration} elapsedTime={elapsedTime} progress={progress} isPlaylist={isPlaylist} handleStop={handleStop} handleCancelAnalysis={handleCancelAnalysis} handleNewDownload={handleNewDownload} formatDuration={formatDuration} />
        </section>

        <div className="flex min-h-0 flex-1 flex-col">
          <DownloadHistory onRedownload={handleRedownload} />
        </div>

        <footer className="engrave">
          <AppVersion />
        </footer>
      </div>
    </div>
  );
}
