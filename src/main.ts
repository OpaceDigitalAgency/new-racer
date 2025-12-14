import "./styles.css";
import { GameApp } from "./runtime/GameApp";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) throw new Error("Missing #game-canvas");
// Make canvas focusable so keyboard controls reliably work after a click/tap.
if (canvas.tabIndex < 0) canvas.tabIndex = 0;
const focusCanvas = () => canvas.focus({ preventScroll: true });
focusCanvas();
canvas.addEventListener("pointerdown", () => {
  focusCanvas();
});
window.addEventListener("keydown", focusCanvas, { once: true });
if (import.meta.env.DEV) {
  // Helpful sanity check: if this stays at 0, the browser isn't delivering key events to the game.
  let keyCount = 0;
  window.addEventListener("keydown", () => {
    keyCount += 1;
  }, true);
  setInterval(() => {
    (window as any).__keyCount = keyCount;
  }, 250);
}

const uiRoot = document.querySelector<HTMLDivElement>("#ui-root");
if (!uiRoot) throw new Error("Missing #ui-root");

const app = new GameApp({ canvas, uiRoot });
app.start().catch((err) => {
  const pre = document.createElement("pre");
  pre.style.position = "absolute";
  pre.style.inset = "18px";
  pre.style.whiteSpace = "pre-wrap";
  pre.style.padding = "14px";
  pre.style.borderRadius = "14px";
  pre.style.border = "1px solid rgba(255,255,255,0.14)";
  pre.style.background = "rgba(0,0,0,0.55)";
  pre.style.color = "rgba(255,255,255,0.92)";
  pre.style.fontFamily =
    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace";
  pre.textContent = `Failed to start the game.\n\n${String(err)}\n\nTip: try ?engine=webgl2 or ?engine=webgpu`;
  uiRoot.appendChild(pre);
  // eslint-disable-next-line no-console
  console.error(err);
});

window.addEventListener("unhandledrejection", (e) => {
  const reason = (e as PromiseRejectionEvent).reason;
  // eslint-disable-next-line no-console
  console.error("Unhandled rejection:", reason);
});

window.addEventListener("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("Window error:", e.error ?? e.message);
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__gameApp = app;
