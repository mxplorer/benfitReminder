# Credit Card Benefits Tracker

A macOS menu-bar app for tracking credit card benefit usage and ROI — so the
`$550 annual fee` cards you actually use stay worth their weight, and the ones
you don't can be cut loose.

Two surfaces:

- **Tray panel** — quick daily check-off from the menu bar, grouped by card or
  sorted by urgency
- **Main window** — card management, ROI dashboard, usage history, per-year
  membership browser

Built with Tauri v2 + React + TypeScript + Zustand.

---

## Install (macOS)

### Option A — Prebuilt DMG (recommended for users)

1. Download the latest `Credit Card Benefits_<version>_aarch64.dmg`
   (Apple Silicon) or `_x64.dmg` (Intel) from the
   [Releases](../../releases) page.
2. Open the DMG, drag **Credit Card Benefits** to `Applications`.
3. First launch: because the app is not signed with an Apple Developer
   certificate, macOS Gatekeeper will refuse to open it. Either:
   - Right-click the app → **Open** → confirm in the dialog, or
   - In Terminal, clear the quarantine flag:
     ```sh
     xattr -cr "/Applications/Credit Card Benefits.app"
     ```

Data is stored locally at `~/Library/Application Support/com.ccb.app/`.
Nothing leaves your machine.

### Option B — Build from source

Requires macOS, Node ≥ 18, Rust (stable), and Xcode Command Line Tools.

```sh
# 1. Install toolchains (if you don't have them)
xcode-select --install
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Clone + install JS deps
git clone https://github.com/<you>/ccb.git
cd ccb
npm install

# 3. Run in dev mode (hot reload)
npm run tauri dev

# 4. Or produce a release DMG
npm run tauri build
# → src-tauri/target/release/bundle/dmg/Credit Card Benefits_<version>_<arch>.dmg
# → src-tauri/target/release/bundle/macos/Credit Card Benefits.app
```

The DMG is fully self-contained — end users don't need Node, Rust, or any
other runtime. Drag-and-drop install only.

---

## Development

```sh
npm run tauri dev       # run app with hot reload
npm run test            # vitest, one-shot
npm run test:watch      # vitest, watch mode
npm run test:coverage   # coverage report
npm run lint            # eslint
npm run lint:fix        # eslint with autofix
npm run format          # prettier
```

Rust side:

```sh
cd src-tauri
cargo clippy -- -D warnings
```

### Project layout

```
src/
├── lib/                # logger, metrics, transports
├── models/             # TypeScript types + built-in card templates
├── utils/              # pure business logic (period, roi, reminder, rollover)
├── stores/             # Zustand store
├── tauri/              # thin wrappers over Tauri plugin APIs
├── views/tray/         # menu-bar panel UI
├── views/main/         # main window UI
├── views/shared/       # shared components
└── styles/             # theme tokens + glass utilities

src-tauri/              # Rust backend (tray icon, plugin wiring)
tests/                  # integration + E2E tests (unit tests are colocated)
```

See `CLAUDE.md` for coding conventions (file-size limits, test discipline,
commit rules).

---

## Code signing & notarization (optional)

The prebuilt DMG in Releases is **unsigned**. Users will hit the Gatekeeper
warning described above. To ship a cleanly-opening DMG:

1. Enroll in the Apple Developer Program (paid).
2. Create a Developer ID Application certificate and install it in Keychain.
3. Set the signing identity and notarization credentials before building:
   ```sh
   export APPLE_SIGNING_IDENTITY="Developer ID Application: <Your Name> (<TEAMID>)"
   export APPLE_ID="you@example.com"
   export APPLE_PASSWORD="<app-specific password>"
   export APPLE_TEAM_ID="<TEAMID>"
   npm run tauri build
   ```
   Tauri will sign and notarize automatically when these are set.

---

## License

TBD.
