const KEY = "neon-dusk-circuit:v1";

export type PersistedState = {
  quality: "low" | "medium" | "high";
  selectedCar: "basic" | "premium";
  premiumUnlocked: boolean;
};

const DEFAULTS: PersistedState = {
  quality: "high",
  selectedCar: "basic",
  premiumUnlocked: false
};

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      quality: parsed.quality ?? DEFAULTS.quality,
      selectedCar: parsed.selectedCar ?? DEFAULTS.selectedCar,
      premiumUnlocked: parsed.premiumUnlocked ?? DEFAULTS.premiumUnlocked
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveState(next: PersistedState): void {
  localStorage.setItem(KEY, JSON.stringify(next));
}

