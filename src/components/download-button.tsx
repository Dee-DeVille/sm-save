import { Button } from "./ui/button";
import { Loader2 } from "lucide-react";

type Props = {
    isPlaylist: boolean;
    selectedItems: number[];
    status: string;
    handleDownload: () => void;
    url: string;
}

/**
 * The record key: the one ochre control on the faceplate.
 */
export default function DownloadButton({ isPlaylist, selectedItems, status, handleDownload, url }: Props) {
    return (
        <Button
            onClick={handleDownload}
            disabled={!url || status === "downloading"}
            className="h-8 min-w-32 gap-2 text-xs"
        >
            {status === "downloading" ? (
                <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Writing…</span>
                </>
            ) : (
                <>
                    <span className="size-2 rounded-full bg-ochre-ink/70" />
                    <span>{isPlaylist ? `Download ${selectedItems.length}` : "Download"}</span>
                </>
            )}
        </Button>
    )
}
