import type { Engine, Scene } from "@babylonjs/core";

export type GameState = "menu" | "garage" | "race";

export type QualityPreset = "low" | "medium" | "high";

export type GameAppInit = {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLDivElement;
};

export type FrameContext = {
  engine: Engine;
  dt: number;
  now: number;
};

export interface IGameScene {
  readonly state: GameState;
  readonly scene: Scene;
  update(ctx: FrameContext): void;
  dispose(): void;
}

