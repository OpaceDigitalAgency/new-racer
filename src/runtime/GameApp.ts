import type { Engine } from "@babylonjs/core";
import { createBestEngine } from "./createEngine";
import type { GameAppInit, GameState, IGameScene } from "./types";
import { loadState, saveState } from "./storage";
import { UIManager } from "../ui/UIManager";
import { GarageScene } from "../world/scenes/GarageScene";
import { MenuScene } from "../world/scenes/MenuScene";

export class GameApp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ui: UIManager;
  private engine: Engine | null = null;
  private active: IGameScene | null = null;
  private state: ReturnType<typeof loadState>;
  private currentState: GameState = "menu";
  private lastNow = performance.now();

  constructor(init: GameAppInit) {
    this.canvas = init.canvas;
    this.state = loadState();
    this.ui = new UIManager(init.uiRoot, {
      getState: () => this.state,
      onSetQuality: (quality) => {
        this.state = { ...this.state, quality };
        saveState(this.state);
        this.active?.scene.getEngine().resize();
      },
      onStartRace: () => this.setState("race"),
      onOpenGarage: () => this.setState("garage"),
      onBackToMenu: () => this.setState("menu"),
      onSelectCar: (car) => {
        this.state = { ...this.state, selectedCar: car };
        saveState(this.state);
        if (this.currentState === "garage" && this.active instanceof GarageScene) {
          this.active.setSelectedCar(car);
        }
      },
      onUnlockPremium: () => {
        this.state = { ...this.state, premiumUnlocked: true, selectedCar: "premium" };
        saveState(this.state);
        if (this.currentState === "garage" && this.active instanceof GarageScene) {
          this.active.setPremiumUnlocked(true);
          this.active.setSelectedCar("premium");
        }
      }
    });
  }

  async start(): Promise<void> {
    this.ui.mount();
    this.ui.setLoading(true, "Initializing renderer…");

    const { engine, kind } = await createBestEngine(this.canvas);
    this.engine = engine;

    window.addEventListener("resize", () => engine.resize());
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.currentState === "race") {
        void this.setState("menu");
      }
    });
    this.ui.setEngineKind(kind);
    await this.setState("menu");
    this.ui.setLoading(false);

    engine.runRenderLoop(() => {
      if (!this.active) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.lastNow) / 1000);
      this.lastNow = now;

      this.active.update({ engine, dt, now });
      this.active.scene.render();
    });
  }

  private async setState(next: GameState): Promise<void> {
    this.currentState = next;
    this.ui.setScreen(next);
    if (!this.engine) return;

    this.ui.bindHud(null);
    this.active?.dispose();
    this.active = null;

    if (next === "menu") {
      this.active = new MenuScene(this.engine, this.canvas, this.state);
      return;
    }

    if (next === "garage") {
      const scene = new GarageScene(this.engine, this.canvas, this.state);
      this.active = scene;
      return;
    }

    this.ui.setLoading(true, "Building the circuit…");
    try {
      const { RaceScene } = await import("../world/scenes/RaceScene");
      const scene = new RaceScene(this.engine, this.canvas, this.state, (p) => {
        this.ui.setLoading(true, p.label);
        this.ui.setLoadingProgress(p.progress);
      });
      this.active = scene;
      await scene.initAsync();
      this.ui.setLoading(false);
      this.ui.bindHud(() => scene.getHudState());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      this.ui.setLoading(false);
      this.ui.toast("Failed to start race. Try ?engine=webgl2 or ?engine=webgpu");
      await this.setState("menu");
    }
  }
}
