import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";

type Props = {
    setLimitPlaylist: (limitPlaylist: boolean) => void;
    isPlaylist: boolean;
    setIsPlaylist: (isPlaylist: boolean) => void;
    status: string;
    setAvailableFormats: (availableFormats: any[]) => void;
    setIsAnalyzed: (isAnalyzed: boolean) => void;
    setVideoInfo: (videoInfo: any) => void;
    setPlaylistItems: (playlistItems: any[]) => void;
}

/**
 * Playlist handling for URLs that carry a list id, printed as a second row
 * under the session strip.
 */
export default function SelectPlaylist({ setLimitPlaylist, isPlaylist, setIsPlaylist, status, setAvailableFormats, setIsAnalyzed, setVideoInfo, setPlaylistItems }: Props) {
    return (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted select-none">
                <Checkbox
                    checked={isPlaylist}
                    onCheckedChange={(checked: boolean) => {
                        setIsPlaylist(checked);
                        setAvailableFormats([]);
                        setIsAnalyzed(false);
                        setVideoInfo(null);
                        setPlaylistItems([]);
                    }}
                    disabled={status === "downloading" || status === "analyzing"}
                    className="size-3.5"
                />
                Process as playlist
            </label>

            {isPlaylist && (
                <RadioGroup
                    defaultValue="max50"
                    className="flex w-auto flex-row gap-4"
                    orientation="horizontal"
                    onValueChange={(value) => {
                        if (value === "max50") {
                            setLimitPlaylist(true)
                            setIsAnalyzed(false)
                        } else {
                            setLimitPlaylist(false)
                            setIsAnalyzed(false)
                        }
                    }}
                >
                    <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="max50" id="r1" className="size-3.5" />
                        <Label htmlFor="r1" className="text-[11px] text-ink-muted">First 50</Label>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="unlimited" id="r2" className="size-3.5" />
                        <Label htmlFor="r2" className="text-[11px] text-ink-muted">Entire list</Label>
                    </div>
                </RadioGroup>
            )}
        </div>
    )
}
