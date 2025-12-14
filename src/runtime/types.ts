import type { Engine, Scene } from "@babylonjs/core";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";

export type GameState = "menu" | "garage" | "race";

export type QualityPreset = "low" | "medium" | "high";

export type GameAppInit = {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLDivElement;
};

export type FrameContext = {
  engine: Engine | WebGPUEngine;
  dt: number;
  now: number;
};

export interface IGameScene {
  readonly state: GameState;
  readonly scene: Scene;
  update(ctx: FrameContext): void;
  dispose(): void;
}

