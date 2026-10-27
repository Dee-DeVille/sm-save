const YOUTUBE_DOMAINS = ["youtube.com", "youtu.be", "youtube-nocookie.com"];
const INSTAGRAM_DOMAINS = ["instagram.com"];
const FACEBOOK_DOMAINS = ["facebook.com", "fb.watch"];

export const isYouTube = (url: string) =>
    YOUTUBE_DOMAINS.some((d) => url.includes(d));

export const isInstagram = (url: string) =>
    INSTAGRAM_DOMAINS.some((d) => url.includes(d));

export const isFacebook = (url: string) =>
    FACEBOOK_DOMAINS.some((d) => url.includes(d));

export const needsYouTubeCookies = (stderr: string): boolean => {
    const s = stderr.toLowerCase();
    return (
        s.includes("sign in") ||
        s.includes("login required") ||
        s.includes("private video") ||
        s.includes("age") && s.includes("restrict") ||
        s.includes("this video is not available") ||
        s.includes("members-only") ||
        s.includes("join this channel") ||
        s.includes("confirm your age") ||
        (s.includes("403") && s.includes("youtube"))
    );
};
export type SupportedBrowser =
    | "chrome"
    | "safari"
    | "brave"
    | "firefox"
    | "edge"
    | "chromium"
    | "opera";

export const SUPPORTED_BROWSERS: { id: SupportedBrowser; name: string }[] = [
    { id: "chrome", name: "Google Chrome" },
    { id: "safari", name: "Safari" },
    { id: "brave", name: "Brave" },
    { id: "firefox", name: "Firefox" },
    { id: "edge", name: "Microsoft Edge" },
    { id: "chromium", name: "Chromium" },
    { id: "opera", name: "Opera" },
];

export const getBrowserDisplayName = (browser: SupportedBrowser): string => {
    const found = SUPPORTED_BROWSERS.find((b) => b.id === browser);
    return found ? found.name : browser;
};

export const getBrowserFlags = (
    url: string,
    useBrowserContext: boolean,
    bearerToken: string,
    referer: string,
    withCookies = false,
    browser: SupportedBrowser = "chrome",
): string[] => {
    if (!useBrowserContext) return [];

    const yt = isYouTube(url);
    const ig = isInstagram(url);

    const flags: string[] = [
        "--user-agent",
        ig
            ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
            : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "--add-header", "Accept-Language:en-US,en;q=0.9",
        "--no-check-certificates",
    ];
    if (withCookies) {
        flags.push("--cookies-from-browser", browser);
    }


    if (yt) {
        if (withCookies) {
            flags.push("--extractor-args", "youtube:player-client=tv_embedded,web_embedded");
        }
    }

    if (ig) {
        flags.push("--extractor-args", "instagram:api=iphone");
    }

    if (bearerToken?.trim()) {
        flags.push("--add-header", `Authorization: Bearer ${bearerToken.trim()}`);
    }
    if (referer?.trim()) {
        flags.push("--add-header", `Referer: ${referer.trim()}`);
    }

    return flags;
};