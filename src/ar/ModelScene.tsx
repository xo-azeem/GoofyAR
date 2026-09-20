import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';
import {
  Viro3DObject,
  ViroAmbientLight,
  ViroARScene,
  ViroARTrackingReasonConstants,
  ViroDirectionalLight,
  ViroNode,
  ViroPinchStateTypes,
  ViroPolygon,
  ViroRotateStateTypes,
  ViroTrackingStateConstants,
} from '@reactvision/react-viro';
import type {
  ViroAmbientLightInfo,
  ViroARHitTestResult,
  ViroCameraARHitTest,
  ViroErrorEvent,
  ViroLoadEndEvent,
  ViroTrackingReason,
  ViroTrackingState,
} from '@reactvision/react-viro';

import type { LibraryModel } from '../types';
import { ensureMaterials } from './materials';
import type { SceneBridge } from './sceneBridge';

// Not re-exported from the package index; Viro's own aliases resolve to the same tuples/enums.
type Viro3DPoint = [number, number, number];
type ViroPinchState = ViroPinchStateTypes;
type ViroRotateState = ViroRotateStateTypes;

/** Largest dimension of a freshly placed model, in metres. Pinch to go from 10% to 1000% of this. */
const FIT_SIZE = 0.5;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
/** Ignore hit-test results closer/farther than this from the camera (metres). */
const HIT_MIN_DISTANCE = 0.25;
const HIT_MAX_DISTANCE = 8;
/** How many consecutive frames without a usable hit before the reticle hides. */
const MISS_FRAMES_BEFORE_HIDE = 20;
const RETICLE_UPDATE_MS = 33;
const RETICLE_RADIUS = 0.07;
/** Viro docs: apply rotation as `current - rotationFactor`. Flip to 1 if a device reports it inverted. */
const ROTATE_SIGN = -1;

const ORIGIN: Viro3DPoint = [0, 0, 0];
const UNIT_SCALE: Viro3DPoint = [1, 1, 1];
const NO_ROTATION: Viro3DPoint = [0, 0, 0];
const FLAT: Viro3DPoint = [-90, 0, 0];
const HIT_PRIORITY: Record<ViroARHitTestResult['type'], number> = {
  ExistingPlaneUsingExtent: 0,
  ExistingPlane: 1,
  EstimatedHorizontalPlane: 2,
  DepthPoint: 3,
  FeaturePoint: 4,
};

type Metrics = {
  modelId: string;
  /** Local offset that centres the model on X/Z and puts its lowest point at y=0. */
  offset: Viro3DPoint;
  /** Uniform scale that makes the largest dimension FIT_SIZE metres. */
  fitScale: number;
  /** Footprint in model units, used for the contact shadow. */
  halfX: number;
  halfZ: number;
};

type Transform = {
  position: Viro3DPoint;
  yaw: number;
  /** Absolute uniform scale of the node. */
  scale: number;
  /** Fit scale of the current model, so `scale / fit` is the user's relative zoom. */
  fit: number;
};

type Props = {
  arSceneNavigator?: { viroAppProps?: { bridge: SceneBridge; initialModel: LibraryModel } };
};

function circle(radius: number, segments = 48): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return pts;
}

function ellipse(rx: number, rz: number, segments = 32): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([Math.cos(a) * rx, Math.sin(a) * rz]);
  }
  return pts;
}

const RETICLE_OUTER = circle(RETICLE_RADIUS);
const RETICLE_INNER = circle(RETICLE_RADIUS * 0.82);
const RETICLE_DOT = circle(RETICLE_RADIUS * 0.12);
const NO_HOLES: [number, number][][] = [];

const finite = (p: number[] | undefined): p is Viro3DPoint =>
  Array.isArray(p) && p.length >= 3 && p.every((n) => Number.isFinite(n));

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Yaw (degrees around Y) that turns a +Z-facing model towards the camera. */
function yawTowards(from: Viro3DPoint, to: Viro3DPoint): number {
  return (Math.atan2(to[0] - from[0], to[2] - from[2]) * 180) / Math.PI;
}

function pickHit(results: ViroARHitTestResult[] | undefined, camera: Viro3DPoint | null) {
  if (!Array.isArray(results) || results.length === 0) return null;
  let best: { result: ViroARHitTestResult; position: Viro3DPoint } | null = null;
  let bestRank = Infinity;
  for (const r of results) {
    const rank = HIT_PRIORITY[r?.type];
    if (rank === undefined || rank >= bestRank) continue;
    const p = r.transform?.position;
    if (!finite(p)) continue;
    if (camera) {
      const d = Math.hypot(p[0] - camera[0], p[1] - camera[1], p[2] - camera[2]);
      if (d < HIT_MIN_DISTANCE || d > HIT_MAX_DISTANCE) continue;
    }
    best = { result: r, position: p };
    bestRank = rank;
  }
  return best;
}

/**
 * The AR scene. All per-frame and per-gesture work goes straight to the native
 * nodes through setNativeProps; React state only changes on discrete events
 * (model swapped, surface found/lost, model loaded) so the JS thread stays idle
 * while the user drags, pinches and twists.
 */
export function ModelScene(props: Props) {
  const appProps = props.arSceneNavigator?.viroAppProps;
  const bridge = appProps!.bridge;

  ensureMaterials();

  const sceneRef = useRef<ViroARScene>(null);
  const reticleRef = useRef<ViroNode>(null);
  const modelNodeRef = useRef<ViroNode>(null);
  const objectRef = useRef<Viro3DObject>(null);
  const ambientRef = useRef<ViroAmbientLight>(null);

  const [model, setModel] = useState<LibraryModel>(appProps!.initialModel);
  const [phase, setPhase] = useState<'scanning' | 'placed'>('scanning');
  const [reticleReady, setReticleReady] = useState(false);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [animating, setAnimating] = useState(true);

  // Mutable per-frame state. Never read from render.
  const phaseRef = useRef(phase);
  const cameraRef = useRef<Viro3DPoint | null>(null);
  const reticlePosRef = useRef<Viro3DPoint | null>(null);
  const reticleRotRef = useRef<Viro3DPoint>(NO_ROTATION);
  const reticleQualityRef = useRef(false);
  const surfaceRef = useRef(false);
  const missFramesRef = useRef(0);
  const lastReticleMsRef = useRef(0);
  const lastAmbientMsRef = useRef(0);
  const metricsRef = useRef<Metrics | null>(null);
  const transformRef = useRef<Transform>({ position: ORIGIN, yaw: 0, scale: 1, fit: 1 });
  const pinchRef = useRef({ active: false, start: 1 });
  const rotateRef = useRef({ active: false, start: 0 });
  const measureTokenRef = useRef(0);

  const activeMetrics = metrics?.modelId === model.id ? metrics : null;
  metricsRef.current = activeMetrics;

  // ---------------------------------------------------------------------------
  // Model transform helpers
  // ---------------------------------------------------------------------------

  const applyTransform = useCallback((visible: boolean) => {
    const t = transformRef.current;
    modelNodeRef.current?.setNativeProps({
      position: t.position,
      rotation: [0, t.yaw, 0],
      scale: [t.scale, t.scale, t.scale],
      visible,
      dragPlane: { planePoint: [0, t.position[1], 0], planeNormal: [0, 1, 0], maxDistance: 30 },
    });
  }, []);

  const publishScale = useCallback(() => {
    const t = transformRef.current;
    bridge.publish({ scalePercent: Math.round((t.scale / t.fit) * 100) });
  }, [bridge]);

  const showReticle = useCallback((visible: boolean) => {
    reticleRef.current?.setNativeProps({ visible });
  }, []);

  // ---------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------

  const place = useCallback(() => {
    if (phaseRef.current !== 'scanning') return;
    const target = reticlePosRef.current;
    if (!surfaceRef.current || !target) {
      bridge.publish({ error: 'Point the camera at a surface first.' });
      return;
    }
    if (!metricsRef.current) {
      bridge.publish({ error: 'Still loading the model…' });
      return;
    }
    const t = transformRef.current;
    const camera = cameraRef.current;
    t.position = [target[0], target[1], target[2]];
    t.yaw = camera ? yawTowards(t.position, camera) : 0;
    // Flip the ref immediately so a hit-test callback landing before the next render can't re-show the reticle.
    phaseRef.current = 'placed';
    applyTransform(true);
    showReticle(false);
    setPhase('placed');
    bridge.publish({ phase: 'placed', error: null });
  }, [applyTransform, bridge, showReticle]);

  const reposition = useCallback(() => {
    if (phaseRef.current !== 'placed') return;
    phaseRef.current = 'scanning';
    modelNodeRef.current?.setNativeProps({ visible: false });
    surfaceRef.current = false;
    reticlePosRef.current = null;
    missFramesRef.current = 0;
    setReticleReady(false);
    setPhase('scanning');
    bridge.publish({ phase: 'scanning', surfaceFound: false });
  }, [bridge]);

  // ---------------------------------------------------------------------------
  // Model loading & measuring
  // ---------------------------------------------------------------------------

  const measure = useCallback(
    async (modelId: string) => {
      const token = ++measureTokenRef.current;
      const t = transformRef.current;
      // Measure with the node at a known pose: rotation 0, scale 1, at `t.position`.
      modelNodeRef.current?.setNativeProps({
        position: t.position,
        rotation: NO_ROTATION,
        scale: UNIT_SCALE,
        visible: false,
      });

      let box: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number } | null =
        null;
      for (let attempt = 0; attempt < 8 && token === measureTokenRef.current; attempt++) {
        // Give the renderer a frame or two to compute world transforms for the new geometry.
        await new Promise((r) => setTimeout(r, attempt === 0 ? 80 : 120));
        try {
          const res = await objectRef.current?.getBoundingBoxAsync();
          const b = res?.boundingBox ?? res;
          if (
            b &&
            [b.minX, b.maxX, b.minY, b.maxY, b.minZ, b.maxZ].every((n: unknown) => Number.isFinite(n)) &&
            b.maxX - b.minX > 1e-6 &&
            b.maxY - b.minY > 1e-6
          ) {
            box = b;
            break;
          }
        } catch {
          // Node not attached yet; retry.
        }
      }
      if (token !== measureTokenRef.current) return;

      let next: Metrics;
      if (box) {
        const p = t.position;
        const minX = box.minX - p[0];
        const maxX = box.maxX - p[0];
        const minY = box.minY - p[1];
        const minZ = box.minZ - p[2];
        const maxZ = box.maxZ - p[2];
        const sizeX = maxX - minX;
        const sizeY = box.maxY - box.minY;
        const sizeZ = maxZ - minZ;
        const largest = Math.max(sizeX, sizeY, sizeZ, 1e-4);
        next = {
          modelId,
          offset: [-(minX + maxX) / 2, -minY, -(minZ + maxZ) / 2],
          fitScale: FIT_SIZE / largest,
          halfX: sizeX / 2,
          halfZ: sizeZ / 2,
        };
      } else {
        // Renderer never produced bounds; show the model as authored rather than nothing.
        next = { modelId, offset: ORIGIN, fitScale: 1, halfX: 0.2, halfZ: 0.2 };
      }

      metricsRef.current = next;
      setMetrics(next);
      // Keep the user's relative zoom across model swaps (1 if they never pinched).
      const relative = clamp(t.scale / t.fit, MIN_SCALE, MAX_SCALE);
      t.fit = next.fitScale;
      t.scale = next.fitScale * relative;
      applyTransform(phaseRef.current === 'placed');
      bridge.publish({ loading: false, error: null });
      publishScale();
    },
    [applyTransform, bridge, publishScale],
  );

  const onLoadStart = useCallback(() => {
    bridge.publish({ loading: true, error: null });
  }, [bridge]);

  const onLoadEnd = useCallback(
    (e: NativeSyntheticEvent<ViroLoadEndEvent>) => {
      if (e?.nativeEvent && e.nativeEvent.success === false) {
        bridge.publish({ loading: false, error: 'This model could not be loaded.' });
        return;
      }
      measure(model.id);
    },
    [bridge, measure, model.id],
  );

  const onError = useCallback(
    (e: NativeSyntheticEvent<ViroErrorEvent>) => {
      const message = e?.nativeEvent?.error?.message ?? 'This model could not be loaded.';
      bridge.publish({ loading: false, error: message });
    },
    [bridge],
  );

  // ---------------------------------------------------------------------------
  // Per-frame hit test → reticle
  // ---------------------------------------------------------------------------

  const onCameraARHitTest = useCallback(
    (event: ViroCameraARHitTest) => {
      const cam = event?.cameraOrientation?.position;
      if (finite(cam)) cameraRef.current = cam;
      if (phaseRef.current !== 'scanning') return;

      const now = Date.now();
      if (now - lastReticleMsRef.current < RETICLE_UPDATE_MS) return;
      lastReticleMsRef.current = now;

      const hit = pickHit(event.hitTestResults, cameraRef.current);
      if (!hit) {
        if (++missFramesRef.current >= MISS_FRAMES_BEFORE_HIDE && surfaceRef.current) {
          surfaceRef.current = false;
          reticlePosRef.current = null;
          showReticle(false);
          setReticleReady(false);
          bridge.publish({ surfaceFound: false });
        }
        return;
      }
      missFramesRef.current = 0;

      const prev = reticlePosRef.current;
      const target = hit.position;
      let next: Viro3DPoint;
      if (prev && Math.hypot(target[0] - prev[0], target[1] - prev[1], target[2] - prev[2]) < 0.5) {
        // Low-pass filter for a calm reticle; big jumps (new surface) snap immediately.
        const a = 0.35;
        next = [
          prev[0] + (target[0] - prev[0]) * a,
          prev[1] + (target[1] - prev[1]) * a,
          prev[2] + (target[2] - prev[2]) * a,
        ];
      } else {
        next = [target[0], target[1], target[2]];
      }
      reticlePosRef.current = next;

      const isPlane = hit.result.type !== 'FeaturePoint' && hit.result.type !== 'DepthPoint';
      const rot = hit.result.transform?.rotation;
      reticleRotRef.current = isPlane && finite(rot) ? rot : NO_ROTATION;
      reticleRef.current?.setNativeProps({ position: next, rotation: reticleRotRef.current, visible: true });

      const quality = hit.result.type !== 'FeaturePoint';
      if (quality !== reticleQualityRef.current) {
        reticleQualityRef.current = quality;
        setReticleReady(quality);
      }
      if (!surfaceRef.current) {
        surfaceRef.current = true;
        bridge.publish({ surfaceFound: true });
      }
    },
    [bridge, showReticle],
  );

  // ---------------------------------------------------------------------------
  // Gestures (shared by the model node and the scene background)
  // ---------------------------------------------------------------------------

  const onPinch = useCallback(
    (state: ViroPinchState, factor: number) => {
      if (phaseRef.current !== 'placed' || !Number.isFinite(factor)) return;
      const t = transformRef.current;
      const fit = t.fit;
      const g = pinchRef.current;
      if (state === ViroPinchStateTypes.PINCH_START || !g.active) {
        g.active = true;
        g.start = t.scale;
      }
      const next = clamp(g.start * factor, fit * MIN_SCALE, fit * MAX_SCALE);
      if (next !== t.scale) {
        t.scale = next;
        modelNodeRef.current?.setNativeProps({ scale: [next, next, next] });
      }
      if (state === ViroPinchStateTypes.PINCH_END) {
        g.active = false;
        publishScale();
      }
    },
    [publishScale],
  );

  const onRotate = useCallback((state: ViroRotateState, factor: number) => {
    if (phaseRef.current !== 'placed' || !Number.isFinite(factor)) return;
    const t = transformRef.current;
    const g = rotateRef.current;
    if (state === ViroRotateStateTypes.ROTATE_START || !g.active) {
      g.active = true;
      g.start = t.yaw;
    }
    t.yaw = g.start + ROTATE_SIGN * factor;
    modelNodeRef.current?.setNativeProps({ rotation: [0, t.yaw, 0] });
    if (state === ViroRotateStateTypes.ROTATE_END) g.active = false;
  }, []);

  const onDrag = useCallback((dragToPos: Viro3DPoint) => {
    // Viro moves the node natively; we only mirror the position so later commands start from the right spot.
    if (phaseRef.current !== 'placed' || !finite(dragToPos)) return;
    transformRef.current.position = [dragToPos[0], dragToPos[1], dragToPos[2]];
  }, []);

  const onSceneClick = useCallback(() => {
    if (phaseRef.current === 'scanning') place();
  }, [place]);

  // ---------------------------------------------------------------------------
  // Tracking & lighting
  // ---------------------------------------------------------------------------

  const onTrackingUpdated = useCallback(
    (state: ViroTrackingState, reason: ViroTrackingReason) => {
      if (state === ViroTrackingStateConstants.TRACKING_NORMAL) {
        bridge.publish({ tracking: 'normal', trackingHint: null });
        return;
      }
      const hint =
        reason === ViroARTrackingReasonConstants.TRACKING_REASON_EXCESSIVE_MOTION
          ? 'Slow down a little'
          : reason === ViroARTrackingReasonConstants.TRACKING_REASON_INSUFFICIENT_FEATURES
            ? 'Point at a textured, well-lit area'
            : 'Move your phone slowly';
      bridge.publish({
        tracking: state === ViroTrackingStateConstants.TRACKING_LIMITED ? 'limited' : 'initializing',
        trackingHint: hint,
      });
    },
    [bridge],
  );

  const onAmbientLightUpdate = useCallback((info: ViroAmbientLightInfo) => {
    const now = Date.now();
    if (now - lastAmbientMsRef.current < 500) return;
    lastAmbientMsRef.current = now;
    const intensity = Number(info?.intensity);
    if (!Number.isFinite(intensity)) return;
    // Platform estimates are ~1000 for a normally lit room; keep the model from going pitch black or blowing out.
    ambientRef.current?.setNativeProps({ intensity: clamp(intensity * 0.4, 150, 900) });
  }, []);

  // ---------------------------------------------------------------------------
  // Commands from the UI
  // ---------------------------------------------------------------------------

  useEffect(() => {
    return bridge.onCommand((cmd) => {
      switch (cmd.type) {
        case 'place':
          place();
          break;
        case 'reposition':
          reposition();
          break;
        case 'setModel': {
          if (cmd.model.id === model.id) break;
          measureTokenRef.current++;
          modelNodeRef.current?.setNativeProps({ visible: false });
          setModel(cmd.model);
          bridge.publish({
            loading: true,
            error: null,
            hasAnimation: cmd.model.stats.animations.length > 0,
          });
          break;
        }
        case 'setAnimating':
          setAnimating(cmd.value);
          bridge.publish({ animating: cmd.value });
          break;
        case 'rotateBy': {
          const t = transformRef.current;
          t.yaw += cmd.degrees;
          modelNodeRef.current?.setNativeProps({ rotation: [0, t.yaw, 0] });
          break;
        }
        case 'resetTransform': {
          const t = transformRef.current;
          t.scale = t.fit;
          t.yaw = cameraRef.current ? yawTowards(t.position, cameraRef.current) : 0;
          applyTransform(phaseRef.current === 'placed');
          publishScale();
          break;
        }
      }
    });
  }, [applyTransform, bridge, model.id, place, publishScale, reposition]);

  useEffect(() => {
    bridge.publish({ hasAnimation: model.stats.animations.length > 0 });
  }, [bridge, model]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const animationName = model.stats.animations[0];
  const animation = useMemo(
    () => (animationName ? { name: animationName, run: animating, loop: true, interruptible: true } : undefined),
    [animationName, animating],
  );

  const dragPlane = useMemo(() => ({ planePoint: ORIGIN, planeNormal: [0, 1, 0] as Viro3DPoint, maxDistance: 30 }), []);
  const anchorTypes = useMemo(
    () => (phase === 'scanning' ? ['PlanesHorizontal', 'PlanesVertical'] : []),
    [phase],
  );
  const shadowVertices = useMemo(
    () => (activeMetrics ? ellipse(activeMetrics.halfX * 1.05, activeMetrics.halfZ * 1.05) : null),
    [activeMetrics],
  );

  return (
    <ViroARScene
      ref={sceneRef}
      anchorDetectionTypes={anchorTypes}
      onCameraARHitTest={onCameraARHitTest}
      onTrackingUpdated={onTrackingUpdated}
      onAmbientLightUpdate={onAmbientLightUpdate}
      onClick={onSceneClick}
      onPinch={onPinch}
      onRotate={onRotate}
    >
      <ViroAmbientLight ref={ambientRef} color="#ffffff" intensity={450} />
      <ViroDirectionalLight color="#ffffff" direction={[0.3, -1, -0.5]} intensity={700} castsShadow={false} />

      {/* Placement reticle — moved every frame with setNativeProps, never re-rendered. */}
      <ViroNode ref={reticleRef} position={ORIGIN} visible={false} ignoreEventHandling>
        <ViroPolygon
          rotation={FLAT}
          vertices={RETICLE_OUTER}
          holes={[RETICLE_INNER]}
          materials={reticleReady ? 'reticleReady' : 'reticleSearching'}
        />
        <ViroPolygon
          rotation={FLAT}
          vertices={RETICLE_DOT}
          holes={NO_HOLES}
          materials={reticleReady ? 'reticleReady' : 'reticleSearching'}
        />
      </ViroNode>

      {/* The model. Hidden while measuring / scanning; revealed and moved natively on placement. */}
      <ViroNode
        ref={modelNodeRef}
        position={ORIGIN}
        rotation={NO_ROTATION}
        scale={UNIT_SCALE}
        visible={false}
        dragType="FixedToPlane"
        dragPlane={dragPlane}
        onDrag={onDrag}
        onPinch={onPinch}
        onRotate={onRotate}
      >
        {shadowVertices && (
          <ViroPolygon
            rotation={FLAT}
            position={[0, 0.003, 0]}
            vertices={shadowVertices}
            holes={NO_HOLES}
            materials="contactShadow"
            ignoreEventHandling
          />
        )}
        <Viro3DObject
          key={model.id}
          ref={objectRef}
          source={model.source}
          type="GLB"
          position={activeMetrics?.offset ?? ORIGIN}
          animation={animation}
          onLoadStart={onLoadStart}
          onLoadEnd={onLoadEnd}
          onError={onError}
        />
      </ViroNode>
    </ViroARScene>
  );
}
