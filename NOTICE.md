# Attribution and third-party notices

SM-SAVE is free software published by **Dee** ([@dee.deville](https://www.instagram.com/dee.deville)).
It would not exist without the work of the projects below.

## Upstream project

SM-SAVE is a rebranded derivative of **VADown** by **mahmingtea**.

- Source: <https://github.com/mahmingtea/vadown>
- Upstream author: [mahmingtea](https://github.com/mahmingtea)
- Upstream license: **MIT**, as stated in the upstream README — *"This project is primarily licensed under the MIT License."*
- Copyright: upstream code remains © mahmingtea under MIT terms; the changes in this repository are © 2026 Dee.

No `LICENSE` file is published upstream, so that README statement is the license grant. The word
"primarily" leaves room for third-party assets with their own terms, which is why the app icon,
faceplate artwork and branding here are original to this repository rather than carried over.

The application shell, window chrome, download pipeline and original Rust/React structure derive
from that project. The SM-SAVE name, artwork, icon, colour treatments, bundle identifier
(`com.dee.sm-save`), updater endpoint and signing keys are original to this repository, and no
upstream branding ships inside the built app.

## Bundled binaries

The installers ship these executables unmodified next to the application. They are fetched at build
time from their official releases and are not part of SM-SAVE's own source.

| Binary | Project | License | Source |
| --- | --- | --- | --- |
| `yt-dlp` | [yt-dlp](https://github.com/yt-dlp/yt-dlp) | Unlicense (public domain) | <https://github.com/yt-dlp/yt-dlp> |
| `ffmpeg` | [FFmpeg](https://ffmpeg.org/) | GPL (BtbN `-gpl` builds) | <https://github.com/BtbN/FFmpeg-Builds>, <https://ffmpeg.org/download.html> |
| `ffprobe` | [FFmpeg](https://ffmpeg.org/) | GPL (BtbN `-gpl` builds) | <https://github.com/BtbN/FFmpeg-Builds>, <https://ffmpeg.org/download.html> |

FFmpeg is distributed under the GNU General Public License; the corresponding source for the exact
builds used is available from the FFmpeg project and from the BtbN build definitions linked above.

## Libraries

SM-SAVE is built with [Tauri](https://tauri.app/) (MIT/Apache-2.0), [React](https://react.dev/)
(MIT), [Vite](https://vite.dev/) (MIT) and [Tailwind CSS](https://tailwindcss.com/) (MIT), plus the
dependencies listed in `package.json` and `src-tauri/Cargo.toml`. Each retains its own copyright and
license.
