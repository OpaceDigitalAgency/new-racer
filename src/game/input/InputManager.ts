export type RawInput = {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  reset: boolean;
};

type KeyState = {
  w: boolean;
  s: boolean;
  a: boolean;
  d: boolean;
  r: boolean;
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
};

export class InputManager {
  private readonly keys: KeyState = { w: false, s: false, a: false, d: false, r: false, up: false, down: false, left: false, right: false };
  private touch = { steer: 0, throttle: 0, brake: 0, active: false };
  private lastReset = false;
  private readonly doc: Document;
  private readonly focusTarget: HTMLElement | null;
  private readonly keyTargets: EventTarget[];
  private readonly pointerTarget: EventTarget;
  private lockPromise: Promise<void> | null = null;

  constructor(private readonly target: Window = window, focusTarget?: HTMLElement | null) {
    this.doc = target.document ?? document;
    this.focusTarget = focusTarget ?? null;
    this.keyTargets = this.uniqueTargets([this.target, this.doc, this.focusTarget].filter(Boolean) as EventTarget[]);
    this.pointerTarget = this.focusTarget ?? this.target;
  }

  attach(): void {
    // Capture phase makes this more resilient to other scripts calling stopPropagation on bubble listeners.
    // Not passive for keyboard - we need to preventDefault on arrow keys to stop page scrolling.
    const keyOpts: AddEventListenerOptions = { passive: false, capture: true };
    for (const t of this.keyTargets) {
      t.addEventListener("keydown", this.onKeyDown as EventListener, keyOpts);
      t.addEventListener("keyup", this.onKeyUp as EventListener, keyOpts);
    }
    this.target.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    this.pointerTarget.addEventListener("pointerdown", this.onPointerDown as EventListener, { passive: true });
    this.pointerTarget.addEventListener("pointermove", this.onPointerMove as EventListener, { passive: true });
    this.pointerTarget.addEventListener("pointerup", this.onPointerUp as EventListener, { passive: true });
    this.pointerTarget.addEventListener("pointercancel", this.onPointerUp as EventListener, { passive: true });
    this.lockKeys();
  }

  detach(): void {
    for (const t of this.keyTargets) {
      t.removeEventListener("keydown", this.onKeyDown as EventListener, true);
      t.removeEventListener("keyup", this.onKeyUp as EventListener, true);
    }
    this.target.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    this.pointerTarget.removeEventListener("pointerdown", this.onPointerDown as EventListener);
    this.pointerTarget.removeEventListener("pointermove", this.onPointerMove as EventListener);
    this.pointerTarget.removeEventListener("pointerup", this.onPointerUp as EventListener);
    this.pointerTarget.removeEventListener("pointercancel", this.onPointerUp as EventListener);
  }

  read(): RawInput {
    const pad = readGamepad();
    // Support both WASD and Arrow keys
    const steerRight = (this.keys.d || this.keys.right) ? 1 : 0;
    const steerLeft = (this.keys.a || this.keys.left) ? 1 : 0;
    const steer = clamp(
      steerRight - steerLeft + pad.steer + this.touch.steer,
      -1,
      1
    );
    const throttle = clamp(((this.keys.w || this.keys.up) ? 1 : 0) + pad.throttle + this.touch.throttle, 0, 1);
    const brake = clamp(((this.keys.s || this.keys.down) ? 1 : 0) + pad.brake + this.touch.brake, 0, 1);

    const reset = this.keys.r && !this.lastReset;
    this.lastReset = this.keys.r;

    return { steer, throttle, brake, reset };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;

    const code = e.code || e.key;
    const handled = this.setKeyState(code, true);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      this.lockKeys();
      // Keep focus on the game so keys keep flowing.
      this.focusTarget?.focus?.({ preventScroll: true });
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;

    const code = e.code || e.key;
    const handled = this.setKeyState(code, false);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    }
  };

  private onBlur = (): void => {
    this.clearKeys();
  };

  private onVisibilityChange = (): void => {
    if (document.visibilityState !== "visible") this.clearKeys();
  };

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    this.touch.active = true;
    this.lockKeys();
    this.focusTarget?.focus?.({ preventScroll: true });
    this.updateTouch(e);
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.touch.active || e.pointerType !== "touch") return;
    this.updateTouch(e);
  };

  private onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    this.touch.active = false;
    this.touch.steer = 0;
    this.touch.throttle = 0;
    this.touch.brake = 0;
  };

  private setKeyState(codeOrKey: string, down: boolean): boolean {
    // Prefer `code` (layout independent). Fallback to `key` when unavailable.
    switch (codeOrKey) {
      case "KeyW":
      case "w":
      case "W":
        this.keys.w = down;
        return true;
      case "KeyS":
      case "s":
      case "S":
        this.keys.s = down;
        return true;
      case "KeyA":
      case "a":
      case "A":
        this.keys.a = down;
        return true;
      case "KeyD":
      case "d":
      case "D":
        this.keys.d = down;
        return true;
      case "KeyR":
      case "r":
      case "R":
        this.keys.r = down;
        return true;
      case "ArrowUp":
        this.keys.up = down;
        return true;
      case "ArrowDown":
        this.keys.down = down;
        return true;
      case "ArrowLeft":
        this.keys.left = down;
        return true;
      case "ArrowRight":
        this.keys.right = down;
        return true;
      default:
        return false;
    }
  }

  private clearKeys(): void {
    this.keys.w = false;
    this.keys.s = false;
    this.keys.a = false;
    this.keys.d = false;
    this.keys.r = false;
    this.keys.up = false;
    this.keys.down = false;
    this.keys.left = false;
    this.keys.right = false;
    this.lastReset = false;
  }

  private lockKeys(): void {
    if (!("keyboard" in navigator) || typeof navigator.keyboard?.lock !== "function") return;
    if (this.lockPromise) return;
    const keysToLock = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "KeyR"];
    this.lockPromise = navigator.keyboard
      ?.lock(keysToLock)
      .catch(() => undefined)
      .finally(() => {
        this.lockPromise = null;
      }) as Promise<void> | null;
  }

  private uniqueTargets(targets: EventTarget[]): EventTarget[] {
    const out: EventTarget[] = [];
    for (const t of targets) {
      if (!out.includes(t)) out.push(t);
    }
    return out;
  }

  private updateTouch(e: PointerEvent): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = e.clientX / Math.max(1, w);
    const y = e.clientY / Math.max(1, h);

    // Touch UX: horizontal = steer, vertical = throttle/brake. Bottom half => more throttle.
    const steer = (x - 0.5) * 2;
    const v = (0.6 - y) * 2;
    this.touch.steer = clamp(steer, -1, 1) * 0.95;

    const throttle = Math.max(0, v);
    const brake = Math.max(0, -v);
    this.touch.throttle = clamp(throttle, 0, 1) * 0.9;
    this.touch.brake = clamp(brake, 0, 1) * 0.9;
  }
}

function readGamepad(): { steer: number; throttle: number; brake: number } {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = pads.find(Boolean);
  if (!pad) return { steer: 0, throttle: 0, brake: 0 };

  const steer = clamp(pad.axes?.[0] ?? 0, -1, 1);
  const throttle = clamp(pad.buttons?.[7]?.value ?? 0, 0, 1);
  const brake = clamp(pad.buttons?.[6]?.value ?? 0, 0, 1);
  return { steer, throttle, brake };
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}
