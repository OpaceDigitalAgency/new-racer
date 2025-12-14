import type { Engine } from "@babylonjs/core/Engines/engine";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Scene } from "@babylonjs/core/scene";
import type { PersistedState } from "../../runtime/storage";
import type { FrameContext, IGameScene } from "../../runtime/types";
import { applyQuality } from "../shared/quality";

export class MenuScene implements IGameScene {
  readonly state = "menu" as const;
  readonly scene: Scene;
  private wheel: ReturnType<typeof MeshBuilder.CreateTorus> | null = null;

  constructor(engine: Engine | WebGPUEngine, canvas: HTMLCanvasElement, persisted: PersistedState) {
    const scene = new Scene(engine);
    this.scene = scene;
    applyQuality(engine, scene, persisted.quality);

    const camera = new ArcRotateCamera("menuCam", -Math.PI / 2, 1.08, 8.5, new Vector3(0, 0.6, 0), scene);
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 120;
    camera.panningSensibility = 0;
    camera.lowerRadiusLimit = 6.5;
    camera.upperRadiusLimit = 12;

    const hemi = new HemisphericLight("menuHemi", new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.85;
    hemi.groundColor = new Color3(0.08, 0.08, 0.12);

    const mat = new PBRMaterial("wheelMat", scene);
    mat.albedoColor = new Color3(0.08, 0.1, 0.12);
    mat.metallic = 0.85;
    mat.roughness = 0.25;
    mat.emissiveColor = new Color3(0.35, 0.18, 0.02);

    const wheel = MeshBuilder.CreateTorus("menuWheel", { diameter: 2.6, thickness: 0.25, tessellation: 48 }, scene);
    wheel.material = mat;
    wheel.position.y = 0.55;
    this.wheel = wheel;

    const spokes = MeshBuilder.CreateCylinder("spokes", { height: 0.08, diameter: 1.8, tessellation: 6 }, scene);
    spokes.material = mat;
    spokes.rotation.x = Math.PI / 2;
    spokes.position.y = 0.55;

    const floor = MeshBuilder.CreateGround("floor", { width: 18, height: 18, subdivisions: 1 }, scene);
    const floorMat = new PBRMaterial("floorMat", scene);
    floorMat.albedoColor = new Color3(0.02, 0.03, 0.05);
    floorMat.metallic = 0;
    floorMat.roughness = 1;
    floor.material = floorMat;
  }

  update(ctx: FrameContext): void {
    if (this.wheel) this.wheel.rotation.y += ctx.dt * 0.4;
  }

  dispose(): void {
    this.scene.dispose();
  }
}

