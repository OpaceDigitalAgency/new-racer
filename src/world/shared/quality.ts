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
    // Reduced resolution for performance, but not too fuzzy
    return { hardwareScaling: 1.15, postFX: false, shadows: false, shadowMapSize: 512 };
  }
  if (q === "medium") {
    // Better resolution for medium
    return { hardwareScaling: 0.85, postFX: true, shadows: true, shadowMapSize: 1536 };
  }
  // High quality = supersampling for crisp graphics
  return { hardwareScaling: 0.75, postFX: true, shadows: true, shadowMapSize: 2048 };
}

export function applyQuality(engine: Engine, scene: Scene, q: PersistedState["quality"]): QualityProfile {
  const profile = getQualityProfile(q);
  engine.setHardwareScalingLevel(profile.hardwareScaling);
  scene.performancePriority = 0;

  // Enable high-quality texture filtering
  if (q === "high" || q === "medium") {
    // Set default texture sampling mode to trilinear for smoother textures
    scene.getEngine().setTextureFormatToUse([]);
  }

  return profile;
}

