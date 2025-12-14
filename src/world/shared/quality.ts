import type { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import type { PersistedState } from "../../runtime/storage";

export type QualityProfile = {
  hardwareScaling: number;
  postFX: boolean;
  shadows: boolean;
  shadowMapSize: number;
};

export function getQualityProfile(q: PersistedState["quality"]): QualityProfile {
  if (q === "low") {
    // Reduced resolution for performance, but still decent
    return { hardwareScaling: 1.0, postFX: false, shadows: true, shadowMapSize: 1024 };
  }
  if (q === "medium") {
    // Better resolution and shadows for medium
    return { hardwareScaling: 0.8, postFX: true, shadows: true, shadowMapSize: 2048 };
  }
  // High quality = supersampling for photorealistic crisp graphics
  return { hardwareScaling: 0.65, postFX: true, shadows: true, shadowMapSize: 4096 };
}

export function applyQuality(engine: Engine, scene: Scene, q: PersistedState["quality"]): QualityProfile {
  const profile = getQualityProfile(q);
  engine.setHardwareScalingLevel(profile.hardwareScaling);
  scene.performancePriority = 0;
  return profile;
}

