import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Copy, Minus, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Transport keys for the window itself. There is no titlebar and no casing
 * frame, so minimize, maximize/restore and close live on the faceplate.
 */
export default function WindowControls() {
    const [maximized, setMaximized] = useState(false);

    useEffect(() => {
        let active = true;
        let unlisten: (() => void) | undefined;

        const sync = async () => {
            try {
                const value = await getCurrentWindow().isMaximized();
                if (active) setMaximized(value);
            } catch {
                // Browser preview: no window to inspect.
            }
        };

        try {
            getCurrentWindow()
                .onResized(() => void sync())
                .then((fn) => {
                    if (active) unlisten = fn;
                    else fn();
                })
                .catch(() => undefined);
            void sync();
        } catch {
            // Browser preview: no window to listen to.
        }

        return () => {
            active = false;
            unlisten?.();
        };
    }, []);

    const run = async (action: (win: ReturnType<typeof getCurrentWindow>) => Promise<void>) => {
        try {
            await action(getCurrentWindow());
        } catch (err) {
            console.error("Window control failed:", err);
        }
    };

    const keyClass =
        "flex h-7 w-8 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-face-raised hover:text-ink";

    return (
        <div role="group" aria-label="Window controls" className="flex items-center gap-0.5">
            <button
                type="button"
                aria-label="Minimize"
                title="Minimize"
                onClick={() => run((win) => win.minimize())}
                className={keyClass}
            >
                <Minus aria-hidden className="size-3.5" />
            </button>
            <button
                type="button"
                aria-label={maximized ? "Restore" : "Maximize"}
                title={maximized ? "Restore" : "Maximize"}
                onClick={() => run((win) => win.toggleMaximize())}
                className={keyClass}
            >
                {maximized ? (
                    <Copy aria-hidden className="size-3" />
                ) : (
                    <Square aria-hidden className="size-3" />
                )}
            </button>
            <button
                type="button"
                aria-label="Close"
                title="Close"
                onClick={() => run((win) => win.close())}
                className={cn(keyClass, "hover:bg-record hover:text-white")}
            >
                <X aria-hidden className="size-3.5" />
            </button>
        </div>
    );
}
