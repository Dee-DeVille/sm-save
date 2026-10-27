import { useState, useEffect, useMemo, useCallback } from "react";
import {
  DownloadHistoryItem,
  DiskStatus,
  loadHistory,
  removeHistoryItem,
  clearHistory,
  batchCheckDiskStatus,
  revealInFolder,
  deleteFileFromDisk,
} from "@/lib/history";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Play,
  FolderOpen,
  RotateCcw,
  Trash2,
  Search,
  X,
  Music,
  Video,
  Layers,
  AlertTriangle,
  FolderSearch,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DownloadHistoryProps {
  onRedownload: (item: DownloadHistoryItem) => void;
}

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDurationSec(seconds?: number): string {
  if (!seconds || seconds <= 0) return "";
  const sec = Math.floor(seconds % 60);
  const min = Math.floor((seconds / 60) % 60);
  const hr = Math.floor(seconds / 3600);
  if (hr > 0) return `${hr}:${min.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

export default function DownloadHistory({ onRedownload }: DownloadHistoryProps) {
  const [items, setItems] = useState<DownloadHistoryItem[]>([]);
  const [diskStatuses, setDiskStatuses] = useState<Record<string, DiskStatus>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "video" | "audio" | "playlist">("all");
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isClearAllDialogOpen, setIsClearAllDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshDiskStatus = useCallback(async (currentItems: DownloadHistoryItem[]) => {
    if (currentItems.length === 0) {
      setDiskStatuses({});
      return;
    }
    const statuses = await batchCheckDiskStatus(currentItems);
    setDiskStatuses(statuses);
  }, []);

  const reloadData = useCallback(() => {
    const loaded = loadHistory();
    setItems(loaded);
    refreshDiskStatus(loaded);
  }, [refreshDiskStatus]);

  useEffect(() => {
    reloadData();

    const handleHistoryUpdated = () => {
      reloadData();
    };

    const handleFocus = () => {
      // Re-verify disk status whenever user returns to SM-SAVE
      const current = loadHistory();
      refreshDiskStatus(current);
    };

    window.addEventListener("sm-save:history-updated", handleHistoryUpdated);
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("sm-save:history-updated", handleHistoryUpdated);
      window.removeEventListener("focus", handleFocus);
    };
  }, [reloadData, refreshDiskStatus]);

  useEffect(() => {
    if (!isClearAllDialogOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsClearAllDialogOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isClearAllDialogOpen]);

  const handleOpenFile = async (item: DownloadHistoryItem) => {
    setActionError(null);
    try {
      if (item.isPlaylist) {
        await invoke("open_download_folder", { path: item.filePath });
      } else {
        await openPath(item.filePath);
      }
    } catch (err) {
      console.error("Failed to open path:", err);
      setActionError(`Could not open: ${String(err)}`);
    }
  };

  const handleRevealInFinder = async (item: DownloadHistoryItem) => {
    setActionError(null);
    try {
      await revealInFolder(item.filePath);
    } catch (err) {
      console.error("Failed to reveal in Finder:", err);
      setActionError(`Could not reveal: ${String(err)}`);
    }
  };

  const handleDeleteFromDisk = async (item: DownloadHistoryItem) => {
    setActionError(null);
    const cleanPath = (item.filePath || "").trim().replace(/[/\\]+$/, "");
    const cleanLower = cleanPath.toLowerCase();
    if (
      !cleanPath ||
      cleanPath === "/" ||
      cleanLower.endsWith("/downloads") ||
      cleanLower.endsWith("\\downloads") ||
      cleanLower.endsWith("/desktop") ||
      cleanLower.endsWith("/documents") ||
      item.fileName === "Downloads"
    ) {
      handleRemoveFromHistory(item);
      return;
    }
    try {
      await deleteFileFromDisk(cleanPath);
      // Remove from history list so the deleted download is gone from the list too
      handleRemoveFromHistory(item);
    } catch (err) {
      console.error("Failed to delete file from disk:", err);
      if (String(err).includes("safety refusal") || String(err).includes("cannot delete")) {
        handleRemoveFromHistory(item);
      } else {
        setActionError(`Delete failed: ${String(err)}`);
      }
    }
  };

  const handleRemoveFromHistory = (item: DownloadHistoryItem) => {
    const updated = removeHistoryItem(item.id);
    setItems(updated);
    setDeleteConfirmId(null);
  };

  const handleClearAll = () => {
    if (items.length === 0) return;
    clearHistory();
    setItems([]);
    setDiskStatuses({});
    setDeleteConfirmId(null);
  };

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterType === "video" && (item.format !== "video" || item.isPlaylist)) return false;
      if (filterType === "audio" && (item.format !== "audio" || item.isPlaylist)) return false;
      if (filterType === "playlist" && !item.isPlaylist) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.title.toLowerCase().includes(q) ||
        item.fileName.toLowerCase().includes(q) ||
        item.url.toLowerCase().includes(q)
      );
    });
  }, [items, filterType, searchQuery]);

  if (items.length === 0) {
    return (
      <section className="engrave flex min-h-0 flex-1 flex-col px-5 py-3.5">
        <div className="flex items-center justify-between">
          <h2 className="silkscreen">Download History</h2>
          <span className="tnum font-mono text-[10px] text-ink-faint">00</span>
        </div>

        {/* Empty bay: the ruled ledger, waiting for its first entry */}
        <div className="well relative mt-2 min-h-24 flex-1 overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to bottom, transparent 0 35px, var(--rule) 35px 36px)",
            }}
          />
          <div className="relative flex h-9 items-center gap-2 px-3">
            <span className="size-1.5 shrink-0 rounded-full bg-led-dim" />
            <span className="text-[11px] text-ink-faint">
              Nothing recorded yet — finished downloads log here.
            </span>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="engrave flex min-h-0 flex-1 flex-col px-5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <h2 className="silkscreen">Download History</h2>
          <span className="tnum rounded border border-edge bg-well px-1.5 py-0.5 font-mono text-[10px] text-ink-muted">
            {items.length}
          </span>

          {items.length > 2 && (
            <div className="flex items-center gap-0.5">
              {(["all", "video", "audio", "playlist"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={cn(
                    "cursor-pointer rounded px-1.5 py-0.5 text-[10px] capitalize transition-colors",
                    filterType === type
                      ? "bg-face-raised text-ink shadow-[inset_0_1px_0_var(--line-hi)]"
                      : "text-ink-faint hover:text-ink"
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {items.length > 3 && (
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-ink-faint" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter"
                className="h-6 w-32 pl-7 text-[10px]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute top-1/2 right-1.5 -translate-y-1/2 cursor-pointer text-ink-faint hover:text-ink"
                  aria-label="Clear filter"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsClearAllDialogOpen(true)}
            className="h-6 px-2 text-[10px]"
          >
            Clear all
          </Button>
        </div>
      </div>

      {actionError && (
        <div className="mt-2 flex items-center gap-2 rounded-md border border-record/35 bg-record/10 px-2.5 py-1.5 text-[10px] text-record">
          <AlertTriangle className="size-3 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="mt-2 flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        {filteredItems.length === 0 ? (
          <div className="rounded-lg border border-dashed border-edge py-5 text-center text-[10px] text-ink-faint">
            No matching entries.
          </div>
        ) : (
          filteredItems.map((item, position) => {
            const status = diskStatuses[item.id] ?? { exists: true, is_dir: item.isPlaylist };
            const isMissing = !status.exists;
            const isConfirmingDelete = deleteConfirmId === item.id;
            const displaySize = status.size ? formatBytes(status.size) : formatBytes(item.fileSize);

            return (
              <div
                key={item.id}
                className={cn(
                  "group flex items-center gap-2.5 border-b border-line/40 px-2 py-1.5 transition-colors last:border-b-0",
                  isMissing ? "opacity-70" : "hover:bg-face-raised/50"
                )}
              >
                <span className="tnum w-5 shrink-0 text-right font-mono text-[10px] text-ink-faint">
                  {String(position + 1).padStart(2, "0")}
                </span>

                <div className="relative h-9 w-14 shrink-0 overflow-hidden rounded border border-edge bg-well">
                  {item.thumbnail ? (
                    <img
                      src={item.thumbnail}
                      alt=""
                      className={cn("h-full w-full object-cover", isMissing && "grayscale brightness-75")}
                    />
                  ) : item.isPlaylist ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Layers className="size-3.5 text-ink-faint" />
                    </div>
                  ) : item.format === "audio" ? (
                    <div className="flex h-full w-full items-center justify-center">
                      <Music className="size-3.5 text-ink-faint" />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Video className="size-3.5 text-ink-faint" />
                    </div>
                  )}
                  {item.isPlaylist ? (
                    <span className="tnum absolute right-0.5 bottom-0.5 rounded-xs bg-black/80 px-1 font-mono text-[8px] text-white">
                      {item.itemCount || 1}
                    </span>
                  ) : item.duration ? (
                    <span className="tnum absolute right-0.5 bottom-0.5 rounded-xs bg-black/80 px-1 font-mono text-[8px] text-white">
                      {formatDurationSec(item.duration)}
                    </span>
                  ) : null}
                </div>

                <div className="flex min-w-0 flex-1 flex-col">
                  <span
                    className={cn(
                      "truncate text-[11.5px] leading-snug",
                      isMissing ? "text-ink-muted line-through" : "text-ink"
                    )}
                    title={item.title}
                  >
                    {item.title}
                  </span>
                  <span className="tnum flex items-center gap-1.5 truncate font-mono text-[9.5px] text-ink-faint">
                    <span className="text-ink-muted">
                      {item.isPlaylist ? "PLAYLIST" : item.format === "video" ? (item.quality || "MP4") : "MP3"}
                    </span>
                    {displaySize && <span>{displaySize}</span>}
                    <span>{formatTimeAgo(item.timestamp)}</span>
                    <span className={cn("flex items-center gap-1", isMissing ? "text-ink-faint" : "text-led")}>
                      <span className={cn("size-1 rounded-full", isMissing ? "bg-ink-faint" : "bg-led shadow-[0_0_5px_var(--led)]")} />
                      {isMissing ? "missing" : "ready"}
                    </span>
                  </span>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-1 rounded-md border border-edge bg-well p-0.5">
                      {!isMissing ? (
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => handleDeleteFromDisk(item)}
                          className="cursor-pointer"
                          title="Delete file from your computer and remove from list"
                        >
                          Delete
                        </Button>
                      ) : (
                        <Button
                          variant="destructive"
                          size="xs"
                          onClick={() => handleRemoveFromHistory(item)}
                          className="cursor-pointer"
                          title="Remove missing entry from list"
                        >
                          Remove
                        </Button>
                      )}
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        className="cursor-pointer p-1 text-ink-faint hover:text-ink"
                        title="Cancel"
                        aria-label="Cancel delete"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <>
                      {isMissing ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => onRedownload(item)}
                          className="cursor-pointer gap-1"
                        >
                          <RotateCcw className="size-3" />
                          <span>Redownload</span>
                        </Button>
                      ) : item.isPlaylist ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleOpenFile(item)}
                          className="cursor-pointer gap-1"
                          title="Open playlist folder"
                        >
                          <FolderOpen className="size-3" />
                          <span>Folder</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => handleOpenFile(item)}
                          className="cursor-pointer gap-1"
                          title="Play media"
                        >
                          <Play className="size-3 fill-current" />
                          <span>Open</span>
                        </Button>
                      )}

                      {!isMissing && (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleRevealInFinder(item)}
                          className="cursor-pointer text-ink-faint hover:text-ink"
                          title="Show in folder"
                        >
                          <FolderSearch className="size-3.5" />
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => setDeleteConfirmId(item.id)}
                        className="cursor-pointer text-ink-faint hover:bg-record/10 hover:text-record"
                        title="Delete options"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}

        {filteredItems.length > 0 && (
          <div className="mt-auto flex items-center gap-2 pt-3 pb-1">
            <span aria-hidden className="h-px flex-1 bg-line/60" />
            <span className="font-mono text-[9px] font-semibold tracking-[0.145em] text-ink-faint uppercase">
              End of log
            </span>
            <span aria-hidden className="h-px flex-1 bg-line/60" />
          </div>
        )}
      </div>

      {/* Confirmation for clear all */}
      {isClearAllDialogOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px] animate-in fade-in duration-150"
          onClick={() => setIsClearAllDialogOpen(false)}
        >
          <div
            className="plate relative w-full max-w-sm space-y-4 p-5 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 rounded-lg border border-record/30 bg-record/10 p-2 text-record">
                <Trash2 className="size-4" />
              </div>
              <div className="space-y-1">
                <h3 className="condensed text-[15px] font-semibold text-ink-strong">
                  Clear the log?
                </h3>
                <p className="text-[11px] leading-relaxed text-ink-muted">
                  Removes all <span className="tnum font-mono text-ink">{items.length}</span> entries from the list. Files already on your disk stay where they are.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-1.5 border-t border-line/70 pt-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsClearAllDialogOpen(false)}
                className="h-8 text-[11px]"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  handleClearAll();
                  setIsClearAllDialogOpen(false);
                }}
                className="h-8 text-[11px]"
              >
                Clear log
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
