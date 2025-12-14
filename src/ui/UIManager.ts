import type { EngineKind } from "../runtime/createEngine";
import type { PersistedState } from "../runtime/storage";
import { PREMIUM_UNLOCK_CODE, STRIPE_PAYMENT_LINK } from "../config";

export type HudState = {
  speedMph: number;
  gear: number;
  lap: number;
  lapTimeSeconds: number;
};

type UIHandlers = {
  getState: () => PersistedState;
  onSetQuality: (q: PersistedState["quality"]) => void;
  onStartRace: () => void;
  onOpenGarage: () => void;
  onBackToMenu: () => void;
  onSelectCar: (car: PersistedState["selectedCar"]) => void;
  onUnlockPremium: () => void;
};

export class UIManager {
  private readonly root: HTMLDivElement;
  private readonly handlers: UIHandlers;
  private engineKind: EngineKind = "webgl2";
  private screen: "menu" | "garage" | "race" = "menu";
  private hudGetter: (() => HudState) | null = null;

  private menuEl!: HTMLDivElement;
  private garageEl!: HTMLDivElement;
  private loadingEl!: HTMLDivElement;
  private hudEl!: HTMLDivElement;
  private toastEl!: HTMLDivElement;

  private hudSpeedEl!: HTMLDivElement;
  private hudGearEl!: HTMLSpanElement;
  private hudLapEl!: HTMLSpanElement;
  private hudTimeEl!: HTMLSpanElement;

  private loadingBarEl!: HTMLDivElement;
  private loadingLabelEl!: HTMLDivElement;

  constructor(root: HTMLDivElement, handlers: UIHandlers) {
    this.root = root;
    this.handlers = handlers;
  }

  mount(): void {
    this.root.innerHTML = "";

    this.menuEl = this.buildMenu();
    this.garageEl = this.buildGarage();
    this.loadingEl = this.buildLoading();
    this.hudEl = this.buildHud();
    this.toastEl = document.createElement("div");
    this.toastEl.className = "toast";
    this.root.append(this.menuEl, this.garageEl, this.loadingEl, this.hudEl, this.toastEl);

    this.setScreen("menu");
    const loop = () => {
      this.tick();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  setEngineKind(kind: EngineKind): void {
    this.engineKind = kind;
    const el = this.menuEl.querySelector<HTMLElement>("[data-engine-kind]");
    if (el) el.textContent = kind === "webgpu" ? "WebGPU" : "WebGL2";
  }

  setScreen(state: "menu" | "garage" | "race"): void {
    this.screen = state;
    this.menuEl.style.display = state === "menu" ? "grid" : "none";
    this.garageEl.style.display = state === "garage" ? "grid" : "none";
    this.hudEl.style.display = state === "race" ? "block" : "none";
    if (state === "garage") this.refreshGarage();
  }

  setLoading(show: boolean, label = "Loading…"): void {
    this.loadingEl.style.display = show ? "grid" : "none";
    this.loadingLabelEl.textContent = label;
    if (!show) this.setLoadingProgress(0);
  }

  setLoadingProgress(progress: number): void {
    const clamped = Math.max(0, Math.min(1, progress));
    this.loadingBarEl.style.width = `${Math.round(clamped * 100)}%`;
  }

  bindHud(getter: (() => HudState) | null): void {
    this.hudGetter = getter;
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("toast--show");
    window.setTimeout(() => this.toastEl.classList.remove("toast--show"), 2200);
  }

  private tick(): void {
    if (!this.hudGetter || this.screen !== "race") return;
    const s = this.hudGetter();
    this.hudSpeedEl.textContent = `${Math.round(s.speedMph)}`;
    this.hudGearEl.textContent = `${s.gear}`;
    this.hudLapEl.textContent = `${s.lap}`;
    this.hudTimeEl.textContent = formatTime(s.lapTimeSeconds);
  }

  private buildMenu(): HTMLDivElement {
    const screen = document.createElement("div");
    screen.className = "ui-screen";
    const panel = document.createElement("div");
    panel.className = "panel";

    const inner = document.createElement("div");
    inner.className = "panel__inner";

    const title = document.createElement("div");
    title.className = "title";
    title.innerHTML = `
      <div>
        <h1>Neon Dusk Circuit</h1>
        <p>Arcade handling • HDR lighting • Bloom + motion blur • WebGPU-ready</p>
      </div>
      <div class="tag"><span class="tag__dot"></span><span data-engine-kind>…</span></div>
    `;

    const cards = document.createElement("div");
    cards.className = "grid-2";
    cards.innerHTML = `
      <div class="card">
        <h3>Controls</h3>
        <p><span class="kbd">W</span> throttle • <span class="kbd">S</span> brake/reverse • <span class="kbd">A</span>/<span class="kbd">D</span> steer • <span class="kbd">R</span> reset</p>
        <p>Gamepad supported. On mobile: touch-drag left/right to steer, up/down to throttle.</p>
      </div>
      <div class="card">
        <h3>Quality</h3>
        <p>Pick a preset based on your device. WebGPU auto-enabled when available.</p>
        <div class="row">
          <div class="field" style="min-width: 220px">
            <label for="quality">Preset</label>
            <input id="quality" list="quality-presets" />
            <datalist id="quality-presets">
              <option value="high"></option>
              <option value="medium"></option>
              <option value="low"></option>
            </datalist>
          </div>
          <button class="btn btn--ghost" data-action="apply-quality">Apply</button>
        </div>
      </div>
    `;

    const footer = document.createElement("div");
    footer.className = "row";
    footer.innerHTML = `
      <div style="color: var(--muted); font-size: 12px">Tip: Press <span class="kbd">R</span> if you get stuck.</div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end">
        <button class="btn btn--ghost" data-action="garage">Garage</button>
        <button class="btn btn--primary" data-action="start">Start Race</button>
      </div>
    `;

    inner.append(title, cards, footer);
    panel.append(inner);
    screen.append(panel);

    const qualityInput = cards.querySelector<HTMLInputElement>("#quality");
    if (qualityInput) qualityInput.value = this.handlers.getState().quality;

    cards.querySelector("[data-action=apply-quality]")?.addEventListener("click", () => {
      const value = (qualityInput?.value ?? "high").trim().toLowerCase();
      const q = value === "low" || value === "medium" || value === "high" ? value : "high";
      this.handlers.onSetQuality(q);
      this.toast(`Quality set: ${q.toUpperCase()}`);
    });

    screen.querySelector("[data-action=start]")?.addEventListener("click", () => this.handlers.onStartRace());
    screen.querySelector("[data-action=garage]")?.addEventListener("click", () => this.handlers.onOpenGarage());

    return screen;
  }

  private buildGarage(): HTMLDivElement {
    const screen = document.createElement("div");
    screen.className = "ui-screen";
    const panel = document.createElement("div");
    panel.className = "panel";

    const inner = document.createElement("div");
    inner.className = "panel__inner";

    const title = document.createElement("div");
    title.className = "title";
    title.innerHTML = `
      <div>
        <h1>Garage</h1>
        <p>Select your ride. Premium uses the same physics, with extra visual flair.</p>
      </div>
      <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end">
        <button class="btn btn--ghost" data-action="back">Back</button>
        <button class="btn btn--primary" data-action="race">Start Race</button>
      </div>
    `;

    const cards = document.createElement("div");
    cards.className = "grid-2";
    cards.innerHTML = `
      <div class="card" data-car="basic">
        <h3>Basic Car</h3>
        <p>Stable grip, classic silhouette, perfect to learn the circuit.</p>
        <div class="row">
          <span class="tag"><span class="tag__dot" style="background: var(--accent2)"></span><span data-basic-status>Available</span></span>
          <button class="btn" data-action="select-basic">Select</button>
        </div>
      </div>
      <div class="card" data-car="premium">
        <h3>Premium Hypercar</h3>
        <p>Clearcoat paint, neon underglow, and a sharper cockpit dash.</p>
        <div class="row" style="gap: 10px">
          <span class="tag"><span class="tag__dot" style="background: var(--accent)"></span><span data-premium-status>Locked</span></span>
          <button class="btn" data-action="select-premium">Select</button>
        </div>
        <div class="row" style="align-items: end">
          <div class="field" style="min-width: 260px">
            <label for="unlock">Unlock code</label>
            <input id="unlock" placeholder="Enter code after purchase" />
          </div>
          <div style="display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end">
            <button class="btn btn--ghost" data-action="buy">BUY NOW</button>
            <button class="btn" data-action="unlock">Unlock</button>
          </div>
        </div>
        <p style="opacity: 0.85">Prototype pattern: the buy button copies a Stripe Payment Link; after payment, paste your code here to unlock.</p>
      </div>
    `;

    inner.append(title, cards);
    panel.append(inner);
    screen.append(panel);

    screen.querySelector("[data-action=back]")?.addEventListener("click", () => this.handlers.onBackToMenu());
    screen.querySelector("[data-action=race]")?.addEventListener("click", () => this.handlers.onStartRace());

    screen.querySelector("[data-action=select-basic]")?.addEventListener("click", () => {
      this.handlers.onSelectCar("basic");
      this.toast("Selected: Basic Car");
      this.refreshGarage();
    });
    screen.querySelector("[data-action=select-premium]")?.addEventListener("click", () => {
      if (!this.handlers.getState().premiumUnlocked) {
        this.toast("Premium is locked. Buy + unlock first.");
        return;
      }
      this.handlers.onSelectCar("premium");
      this.toast("Selected: Premium Hypercar");
      this.refreshGarage();
    });

    const unlockInput = screen.querySelector<HTMLInputElement>("#unlock");
    screen.querySelector("[data-action=buy]")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(STRIPE_PAYMENT_LINK);
        this.toast("Payment link copied to clipboard.");
      } catch {
        this.toast(`Copy this link: ${STRIPE_PAYMENT_LINK}`);
      }
    });
    screen.querySelector("[data-action=unlock]")?.addEventListener("click", () => {
      const code = (unlockInput?.value ?? "").trim();
      if (!code) {
        this.toast("Enter an unlock code.");
        return;
      }
      if (code.toUpperCase() === PREMIUM_UNLOCK_CODE) {
        this.handlers.onUnlockPremium();
        this.toast("Premium unlocked.");
        this.refreshGarage();
        return;
      }
      this.toast("Invalid code.");
    });

    return screen;
  }

  private refreshGarage(): void {
    const state = this.handlers.getState();
    const basic = this.garageEl.querySelector<HTMLElement>("[data-car=basic]");
    const prem = this.garageEl.querySelector<HTMLElement>("[data-car=premium]");
    basic?.setAttribute(
      "style",
      state.selectedCar === "basic" ? "outline: 1px solid rgba(0,199,255,.45)" : ""
    );
    prem?.setAttribute(
      "style",
      state.selectedCar === "premium" ? "outline: 1px solid rgba(255,106,0,.45)" : ""
    );

    const premiumStatus = this.garageEl.querySelector<HTMLElement>("[data-premium-status]");
    if (premiumStatus) premiumStatus.textContent = state.premiumUnlocked ? "Unlocked" : "Locked";
    const selectPremiumBtn = this.garageEl.querySelector<HTMLButtonElement>("[data-action=select-premium]");
    if (selectPremiumBtn) selectPremiumBtn.disabled = !state.premiumUnlocked;
  }

  private buildLoading(): HTMLDivElement {
    const screen = document.createElement("div");
    screen.className = "ui-screen";
    screen.style.display = "none";
    const panel = document.createElement("div");
    panel.className = "panel";
    const inner = document.createElement("div");
    inner.className = "panel__inner";
    inner.innerHTML = `
      <div class="title">
        <div>
          <h1>Loading</h1>
          <p data-loading-label>…</p>
        </div>
      </div>
      <div style="height: 10px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; border: 1px solid rgba(255,255,255,0.12)">
        <div data-loading-bar style="height: 100%; width: 0%; background: linear-gradient(90deg, rgba(0,199,255,0.65), rgba(255,106,0,0.85))"></div>
      </div>
      <div style="color: var(--muted); font-size: 12px">First load can take a moment while shaders compile (especially on WebGPU).</div>
    `;
    panel.append(inner);
    screen.append(panel);

    this.loadingBarEl = inner.querySelector<HTMLDivElement>("[data-loading-bar]")!;
    this.loadingLabelEl = inner.querySelector<HTMLDivElement>("[data-loading-label]")!;
    return screen;
  }

  private buildHud(): HTMLDivElement {
    const hud = document.createElement("div");
    hud.className = "hud";
    hud.style.display = "none";
    hud.innerHTML = `
      <div class="hud__panel">
        <div class="hud__big">
          <div>
            <div class="hud__speed" data-hud-speed>0</div>
            <div style="margin-top: 2px; color: var(--muted); letter-spacing: 1.2px">
              <span class="hud__unit">MPH</span>
            </div>
          </div>
          <div class="hud__meta">
            <span>GEAR <b data-hud-gear>1</b></span>
            <span>LAP <b data-hud-lap>1</b></span>
            <span><b data-hud-time>00:00.00</b></span>
          </div>
        </div>
      </div>
    `;
    this.hudSpeedEl = hud.querySelector<HTMLDivElement>("[data-hud-speed]")!;
    this.hudGearEl = hud.querySelector<HTMLSpanElement>("[data-hud-gear]")!;
    this.hudLapEl = hud.querySelector<HTMLSpanElement>("[data-hud-lap]")!;
    this.hudTimeEl = hud.querySelector<HTMLSpanElement>("[data-hud-time]")!;
    return hud;
  }
}

function formatTime(totalSeconds: number): string {
  const ms = Math.max(0, Math.floor((totalSeconds % 1) * 100));
  const s = Math.max(0, Math.floor(totalSeconds) % 60);
  const m = Math.max(0, Math.floor(totalSeconds / 60));
  return `${`${m}`.padStart(2, "0")}:${`${s}`.padStart(2, "0")}.${`${ms}`.padStart(2, "0")}`;
}

