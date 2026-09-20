import type { LibraryModel } from '../types';

export type TrackingQuality = 'initializing' | 'limited' | 'normal';

export type SceneStatus = {
  phase: 'scanning' | 'placed';
  surfaceFound: boolean;
  tracking: TrackingQuality;
  trackingHint: string | null;
  loading: boolean;
  error: string | null;
  animating: boolean;
  hasAnimation: boolean;
  /** Current uniform scale relative to the auto-fitted size, in percent. */
  scalePercent: number;
};

export type SceneCommand =
  | { type: 'place' }
  | { type: 'reposition' }
  | { type: 'setModel'; model: LibraryModel }
  | { type: 'setAnimating'; value: boolean }
  | { type: 'rotateBy'; degrees: number }
  | { type: 'resetTransform' };

export const initialSceneStatus: SceneStatus = {
  phase: 'scanning',
  surfaceFound: false,
  tracking: 'initializing',
  trackingHint: null,
  loading: true,
  error: null,
  animating: true,
  hasAnimation: false,
  scalePercent: 100,
};

type Listener<T> = (value: T) => void;

/**
 * Two-way channel between the React UI and the Viro scene. Keeping commands
 * and status out of `viroAppProps` means the ViroARSceneNavigator never
 * re-renders while the user interacts, which is what keeps gestures smooth.
 */
export class SceneBridge {
  private commandListeners = new Set<Listener<SceneCommand>>();
  private statusListeners = new Set<Listener<SceneStatus>>();
  status: SceneStatus = initialSceneStatus;

  send(command: SceneCommand) {
    this.commandListeners.forEach((l) => l(command));
  }

  onCommand(listener: Listener<SceneCommand>) {
    this.commandListeners.add(listener);
    return () => {
      this.commandListeners.delete(listener);
    };
  }

  publish(patch: Partial<SceneStatus>) {
    const next = { ...this.status, ...patch };
    // Skip no-op publishes so per-frame callbacks can call this freely.
    let changed = false;
    for (const key in next) {
      if ((next as any)[key] !== (this.status as any)[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.status = next;
    this.statusListeners.forEach((l) => l(next));
  }

  onStatus(listener: Listener<SceneStatus>) {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }
}
