import { Globe, SlidersHorizontal } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Checkbox } from "./ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "./ui/select";
import React, { useState } from "react";
import { SupportedBrowser, SUPPORTED_BROWSERS } from "@/lib/browser-flags";
import { cn } from "@/lib/utils";

type Props = {
    useBrowserContext: boolean;
    setUseBrowserContext: (useBrowserContext: boolean) => void;
    selectedBrowser: SupportedBrowser;
    setSelectedBrowser: (browser: SupportedBrowser) => void;
    bearerToken: string;
    setBearerToken: (bearerToken: string) => void;
    referer: string;
    setReferer: (referer: string) => void;
    status: "idle" | "analyzing" | "downloading" | "success" | "error";
    setPlaylistItems: (items: { index: number, title: string, duration?: number }[]) => void;
    setIsAnalyzed: React.Dispatch<React.SetStateAction<boolean>>;
};

/**
 * Session source strip. Sits directly under the load slot as a single printed
 * row; the header fields unfold into a recessed bay when requested.
 */
export default function BrowserHeader({
    setIsAnalyzed,
    setPlaylistItems,
    useBrowserContext,
    setUseBrowserContext,
    selectedBrowser,
    setSelectedBrowser,
    bearerToken,
    setBearerToken,
    referer,
    setReferer,
    status,
}: Props) {
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const hasCustomHeaders = Boolean(bearerToken.trim() || referer.trim());
    const isBusy = status === "downloading" || status === "analyzing";

    return (
        <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-muted select-none">
                    <Checkbox
                        checked={useBrowserContext}
                        onCheckedChange={(checked: boolean) => {
                            setUseBrowserContext(checked);
                            setIsAnalyzed(false);
                            if (!checked) setPlaylistItems([]);
                        }}
                        disabled={isBusy}
                        className="size-3.5"
                    />
                    <span className="flex items-center gap-1.5">
                        <Globe className={cn("size-3.5 transition-colors", useBrowserContext ? "text-ochre" : "text-ink-faint")} />
                        Use browser session
                    </span>
                </label>

                {useBrowserContext && (
                    <div className="flex items-center gap-1.5">
                        <Select
                            value={selectedBrowser}
                            onValueChange={(value) => {
                                setSelectedBrowser(value as SupportedBrowser);
                                setIsAnalyzed(false);
                            }}
                            disabled={isBusy}
                        >
                            <SelectTrigger className="h-7 min-w-28 text-[11px]">
                                <SelectValue placeholder="Select browser" />
                            </SelectTrigger>
                            <SelectContent>
                                {SUPPORTED_BROWSERS.map((b) => (
                                    <SelectItem
                                        key={b.id}
                                        value={b.id}
                                        className="text-[11px]"
                                    >
                                        {b.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Button
                            variant={isAdvancedOpen ? "secondary" : "ghost"}
                            size="sm"
                            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
                            disabled={isBusy}
                            className="h-7 gap-1.5 px-2 text-[11px]"
                            title="Configure custom headers"
                        >
                            <SlidersHorizontal className="size-3.5" />
                            <span>Headers</span>
                            {hasCustomHeaders && (
                                <span className="size-1.5 rounded-full bg-ochre shadow-[0_0_6px_var(--ochre)]" />
                            )}
                        </Button>
                    </div>
                )}
            </div>

            {useBrowserContext && isAdvancedOpen && (
                <div className="well mt-2 grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="silkscreen block">Token</label>
                        <Input
                            placeholder="Token…"
                            value={bearerToken}
                            onChange={(e) => setBearerToken(e.target.value)}
                            className="h-8 font-mono text-[11px]"
                            disabled={isBusy}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="silkscreen block">Referrer</label>
                        <Input
                            placeholder="https://…"
                            value={referer}
                            onChange={(e) => setReferer(e.target.value)}
                            className="h-8 font-mono text-[11px]"
                            disabled={isBusy}
                        />
                    </div>
                    <p className="col-span-full text-[10px] text-ink-faint">
                        Sent with both the read and the download request.
                    </p>
                </div>
            )}
        </div>
    );
}
