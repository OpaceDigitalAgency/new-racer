import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";

export type EngineKind = "webgpu" | "webgl2";

export async function createBestEngine(
  canvas: HTMLCanvasElement
): Promise<{ engine: Engine; kind: EngineKind }> {
  const forced = new URLSearchParams(window.location.search).get("engine")?.toLowerCase();
  const forceWebGL = forced === "webgl" || forced === "webgl2";
  const forceWebGPU = forced === "webgpu";
  const allowAutoWebGPU = forced === "auto";

  // Default to WebGL2 for stability/compatibility; allow explicit opt-in to WebGPU via `?engine=webgpu`.
  if (forceWebGPU || allowAutoWebGPU) {
    const canUseWebGPU = forceWebGPU
      ? true
      : await withTimeout(WebGPUEngine.IsSupportedAsync, 900).catch(() => false);

    if (canUseWebGPU && !forceWebGL) {
      try {
        const engine = new WebGPUEngine(canvas, {
          adaptToDeviceRatio: true,
          antialias: true
        });
        await withTimeout(engine.initAsync(), 2500);
        return { engine, kind: "webgpu" };
      } catch {
        // Fall back to WebGL2 if WebGPU init fails or hangs on some browsers.
      }
    }
  }

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
    adaptToDeviceRatio: true
  });
  return { engine, kind: "webgl2" };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = window.setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (v) => {
        window.clearTimeout(id);
        resolve(v);
      },
      (err) => {
        window.clearTimeout(id);
        reject(err);
      }
    );
  });
}
