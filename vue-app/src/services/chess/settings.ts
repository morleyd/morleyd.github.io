/**
 * Player-facing tuning scalers for the character layer, persisted to
 * localStorage. Each is a 0–1 knob the controller reads live to scale the same
 * thresholds the restraint pass introduced — so 0 means genuinely off.
 */
export interface WizardSettings {
  chatter: number // ambient banter frequency
  animation: number // how many pieces may animate (0 → none)
  agency: number // how often pieces suggest moves / push back
  chaos: number // rule-breaking stunt frequency (wired once stunts exist)
}

export const DEFAULT_SETTINGS: WizardSettings = { chatter: 0.6, animation: 0.6, agency: 0.6, chaos: 0.55 }

const KEY = 'wizard-chess-settings'

export function loadSettings(): WizardSettings {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* ignore malformed / unavailable storage */
  }
  return { ...DEFAULT_SETTINGS }
}

export function saveSettings(s: WizardSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}
