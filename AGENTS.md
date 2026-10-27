# AI Agent Guidelines for SM-SAVE

Welcome to the **SM-SAVE** repository. Any AI assistant working on this codebase MUST strictly follow these rules and verification steps.

---

## 1. Mandatory Pre-Completion Checks

Before concluding ANY code changes or declaring a task complete, you **MUST** run the following commands and ensure there are **0 errors and 0 warnings**:

### A. TypeScript Typecheck
Verify full static type safety across all React and TypeScript files:
```bash
bun run typecheck
```

### B. Tailwind CSS Lint & Conflict Check
Verify that there are no conflicting Tailwind utility classes or invalid CSS usages:
```bash
bun run lint:tw
```
> *Tip: If fixable issues or canonical class warnings are flagged, run `bunx tailwind-lint "src/**/*.{ts,tsx}" --config ./src/index.css --fix`.*

### C. Rust Backend Check (if `src-tauri` files were modified)
If any Rust code or Cargo configurations were touched:
```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## 2. Tech Stack & Conventions

* **Runtime & Package Manager**: Always use `bun` (e.g., `bun run <script>`, `bun add <pkg>`).
* **Frontend Framework**: React 19 + Vite + TypeScript.
* **Styling**: Tailwind CSS v4 (CSS-first configuration in `src/index.css` via `@import "tailwindcss"`).
  * Always use `cn()` from `@/lib/utils` (powered by `clsx` and `tailwind-merge`) when composing conditional or user-provided class names.
  * Never place conflicting CSS classes on the same state (e.g. avoid `hover:text-foreground hover:text-blue-300`).
* **Desktop Framework**: Tauri v2.
  * Sidecars: `src-tauri/bin/yt-dlp-aarch64-apple-darwin` (Apple Silicon only; Intel Darwin has been intentionally dropped).
  * Dynamic yt-dlp binaries are stored in the user's App Data directory (`$APPDATA/bin/yt-dlp`).
  * In-app updates are powered by `@tauri-apps/plugin-updater`.

---

## 3. Critical System Rules

1. **Executable Permissions**: Any binary in `src-tauri/bin/` must have executable permissions (`chmod +x`). In local development (`bun tauri dev`), ensure `src-tauri/target/debug/yt-dlp` is also executable to prevent macOS `os error 13 (Permission denied)`.
2. **Safe File Operations**: Never execute blanket deletion commands (such as deleting files by base name across the user's entire `~/Downloads` folder). File operations must be scoped strictly to downloaded media.
3. **Maintain Code Integrity**: Preserve all existing comments, docstrings, and established architecture patterns unless specifically instructed otherwise.
