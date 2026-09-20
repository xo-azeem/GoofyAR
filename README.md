# GoofyAR

A minimal, fast AR viewer for `.glb` models. Pick a model from the library, point your phone at a surface, tap to place, then drag / pinch / twist it around. Runs on iOS (ARKit) and Android (ARCore).

## Stack

- **Expo SDK 57 · React Native 0.86 · React 19** (New Architecture)
- **[`@reactvision/react-viro`](https://www.npmjs.com/package/@reactvision/react-viro) 3.0** — ViroReact, wired in through its Expo config plugin (no manual native linking)
- `expo-file-system` (models folder + GLB header parsing), `expo-document-picker` (import from device), `expo-haptics`
- No navigation library: two screens switched in state, so nothing competes with the renderer for the JS thread.

## Run it

AR needs a real device — simulators/emulators have no camera tracking.

```bash
npm install

# Android (device plugged in, USB debugging on)
npm run android

# iOS (macOS + Xcode; device connected)
npm run ios
```

Both commands run `expo prebuild` on first use (the `android/` and `ios/` folders are generated and git-ignored) and then build a dev client. After that, `npm start` serves JS to the installed app.

Requirements: Node 20+, JDK 17+, Android SDK (minSdk 24, ARCore-capable device) / Xcode 16+ and an ARKit-capable iPhone (iOS 15.1+).

## How it works

```
src/
  App.tsx                 Library ⇄ AR screen switch
  screens/LibraryScreen   grid of models, "+" imports a .glb from device storage
  screens/ARScreen        camera overlay UI: coach hints, place button, controls, model switcher
  ar/ModelScene           the Viro AR scene (reticle, placement, gestures, auto-fit)
  ar/sceneBridge          command/status channel between UI and scene
  lib/glb                 reads only the GLB header + JSON chunk → animation names, triangle count
  lib/library             persistent library in <documents>/models + index.json
  models/bundled          models shipped with the app (assets/models)
```

### AR behaviour

- **Preload & measure** — the model loads hidden at the world origin; its bounding box is used to centre it, put its feet on the floor, and auto-fit its largest dimension to 0.5 m. Placement is then instant — no reload.
- **Reticle** — per-frame hit tests are throttled and low-pass filtered, and the reticle moves through `setNativeProps`, so React never re-renders while scanning. Green = on a detected plane, white = feature-point fallback.
- **Placement** — tap the screen or press *Place*. The model faces the camera on placement.
- **Gestures** — one finger drags along the surface (`FixedToPlane`), pinch scales (10 %–1000 %), two-finger twist rotates. Pinch/twist work anywhere on screen, not just on the model. All applied natively; no React state per frame.
- **Animations** — GLB clip names are read from the file header (Viro can't enumerate them), and the first clip auto-plays with a play/pause control.
- **Swap models in place** — the switcher keeps position and relative scale when changing models.

### Adding bundled models

Drop a `.glb` in `assets/models/`, run `node scripts/glb-stats.js assets/models`, and paste the printed entry into `src/models/bundled.ts`.
