import { Engine } from "@babylonjs/core/Engines/engine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";

export type EngineKind = "webgpu" | "webgl2";

/**
 * Check if WebGL is supported in the current browser
 */
function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return !!gl;
  } catch {
    return false;
  }
}

export async function createBestEngine(
  canvas: HTMLCanvasElement
): Promise<{ engine: Engine | WebGPUEngine; kind: EngineKind }> {
  // Check WebGL support first
  if (!isWebGLSupported()) {
    throw new Error("WebGL is not supported in your browser. Please try a different browser or update your current one.");
  }

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

  try {
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "high-performance",
      adaptToDeviceRatio: true
    });
    
    // Verify the engine was created successfully
    if (!engine.getRenderingCanvas()) {
      throw new Error("Failed to initialise WebGL context on canvas");
    }
    
    return { engine, kind: "webgl2" };
  } catch (error) {
    throw new Error(`Failed to create WebGL2 engine: ${error instanceof Error ? error.message : String(error)}`);
  }
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
