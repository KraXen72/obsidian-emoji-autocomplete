# Changelog

## 1.6.2 - 2026-10-31

- Remove the lint-rule suppressions that caused the community directory's automated review to reject the previous release.
- Create detached font probes, canvases, and icons with Obsidian's DOM helpers, then adopt them into the active document to preserve popout support.
- Guard the modern settings refresh API with `requireApiVersion('1.13.0')` and refresh older settings through the shared legacy renderer without calling a deprecated API.
- Keep settings metadata in the plugin's shared definitions, with no dependency on new host APIs when rendering on older Obsidian versions.
- Restore the official restrictions on disabling lint rules in the local advisory checker.

## 1.6.1 - 2026-10-29

- Migrate to Obsidian's declarative settings API so plugin settings can appear in settings search on Obsidian 1.13 and later.
- Keep the legacy settings renderer for older Obsidian versions, with shared definitions and save handlers for both rendering paths.
- Refresh dependent controls through the active settings renderer when changing tag search or history options.
- Improve settings spacing, headings, and history controls; place the clear-history button beside the history limit.
- Use defaults when saved plugin data is not a settings object.
- Move font-probe styles into CSS and remove routine emoji-index logging.
- Expand regression coverage for both settings renderers and saved-data loading.

## 1.6.0 - 2026-10-29

### Added

- Add **Use text style for ©, ®, and ™**, enabled by default. It applies to inserted symbols, picker previews, and rendered shortcodes. Disable it to restore the emoji database's original presentation.
- Add `:minus:` as an alias for `:heavy_minus_sign:`.

### Fixed

- Fix autocomplete for `:+1:` and `:-1:` so the signs are matched literally.
- Check emoji support with the selected text and interface font stacks. Color rendering and width checks help detect blank glyphs, text fallback, and decomposed sequences.
- Keep support results cached. Use **Clear & Re-check** after changing fonts; font changes do not trigger automatic checks.
- Preserve full emoji sequences, including variation selectors, when inserting keycaps and combined emoji. Their appearance still depends on the selected fonts.
- Render additional aliases in Markdown while leaving code, math, unknown shortcodes, and search-only tags untouched.
- Preserve the Tasks and Dataview performance fix: avoid layout-dependent text reads, process each Markdown subtree once, and leave unchanged text nodes untouched.
- Avoid building unused suggestions when a search matches many emoji.
- Use the active document and window for font checks, flag-font overrides, and suggestion icons in popout windows.
- Save settings once after updates and handle failed background history saves.
- Preserve unknown shortcodes such as `:constructor:` and `:toString:` instead of treating inherited object properties as emoji.

### Development and releases

- Add 130 automated tests covering core behavior and performance safeguards, with V8 branch coverage.
- Add optional Obsidian review reports with `pnpm review` and a separate, nonblocking GitHub workflow.
- Support one-off development builds with `pnpm build:dev`, vault detection on WSL/Linux, and an `OBSIDIAN_VAULT` override.
- Publish only `main.js`, `manifest.json`, and `styles.css`, with best-effort GitHub build attestations.

For Windows/Chromium font issues, the optional [Twemoji Windows font](https://gitlab.com/minecraftpiston/twemoji-ttf-windows) provides fixes for blank keycaps and combined emoji. It is installed separately from this plugin. After installing or changing emoji fonts, use **Clear & Re-check** in the plugin settings.
