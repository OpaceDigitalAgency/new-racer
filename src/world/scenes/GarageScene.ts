import type { Engine } from "@babylonjs/core/Engines/engine";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import type { PersistedState } from "../../runtime/storage";
import type { FrameContext, IGameScene } from "../../runtime/types";
import { createCarMesh, type CarStyle } from "../meshes/cars";
import { applyQuality } from "../shared/quality";

export class GarageScene implements IGameScene {
  readonly state = "garage" as const;
  readonly scene: Scene;
  private car: ReturnType<typeof createCarMesh> | null = null;
  private selected: CarStyle;
  private premiumUnlocked: boolean;

  constructor(engine: Engine, canvas: HTMLCanvasElement, persisted: PersistedState) {
    this.selected = persisted.selectedCar;
    this.premiumUnlocked = persisted.premiumUnlocked;

    const scene = new Scene(engine);
    this.scene = scene;
    applyQuality(engine, scene, persisted.quality);

    const camera = new ArcRotateCamera(
      "garageCam",
      -Math.PI / 2,
      1.08,
      7.8,
      new Vector3(0, 0.7, 0),
      scene
    );
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 120;
    camera.panningSensibility = 0;
    camera.lowerRadiusLimit = 5.5;
    camera.upperRadiusLimit = 10.5;

    const hemi = new HemisphericLight("garageHemi", new Vector3(0, 1, 0), scene);
    hemi.intensity = 1.05;

    this.spawnCar();
  }

  setSelectedCar(next: CarStyle): void {
    this.selected = next;
    if (next === "premium" && !this.premiumUnlocked) return;
    this.spawnCar();
  }

  setPremiumUnlocked(unlocked: boolean): void {
    this.premiumUnlocked = unlocked;
  }

  private spawnCar(): void {
    this.car?.dispose();
    const style: CarStyle = this.selected === "premium" && this.premiumUnlocked ? "premium" : "basic";
    this.car = createCarMesh(this.scene, style);
    this.car.position = new Vector3(0, 0, 0);
  }

  update(ctx: FrameContext): void {
    if (this.car) this.car.rotation.y += ctx.dt * 0.45;
  }

  dispose(): void {
    this.scene.dispose();
  }
}

