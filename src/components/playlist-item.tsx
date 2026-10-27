import { Checkbox } from "./ui/checkbox";
import { cn } from "@/lib/utils";

type Props = {
    item: { index: number, title: string, duration?: number };
    selectedItems: number[];
    setSelectedItems: React.Dispatch<React.SetStateAction<number[]>>
    formatDuration: (duration: number) => string;
}

export default function PlaylistItem({ item, selectedItems, setSelectedItems, formatDuration }: Props) {
    const isSelected = selectedItems.includes(item.index);

    return (
        <label
            className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[12px] transition-colors",
                isSelected ? "bg-face-raised/70 text-ink" : "text-ink-muted hover:bg-face-raised/40 hover:text-ink"
            )}
        >
            <Checkbox
                checked={isSelected}
                onCheckedChange={(checked) => {
                    if (checked) setSelectedItems(prev => [...prev, item.index]);
                    else setSelectedItems(prev => prev.filter(i => i !== item.index));
                }}
                className="size-3.5"
            />
            <span className="tnum w-6 shrink-0 text-right font-mono text-[10px] text-ink-faint">
                {String(item.index).padStart(2, "0")}
            </span>
            <span className="flex-1 truncate" title={item.title}>{item.title}</span>
            {item.duration ? (
                <span className="tnum shrink-0 font-mono text-[10px] text-ink-faint">
                    {formatDuration(item.duration * 1000)}
                </span>
            ) : null}
        </label>
    )
}
