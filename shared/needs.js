export const NEEDS_STEP_MS = 5000;
export const LOW_NEED = 30;

export function normalizeNeeds(saved) {
  const value = key => Number.isFinite(saved?.[key]) ? Math.max(0, Math.min(100, saved[key])) : 100;
  return {happiness:value('happiness'),energy:value('energy'),fullness:value('fullness')};
}

export function advanceNeeds(needs, pose) {
  const next = normalizeNeeds(needs);
  next.fullness -= .85;
  next.energy += pose === 'sleep' ? 6 : pose === 'sit' ? 1.5 : -.6;
  next.happiness += pose === 'sit' ? 4 : pose === 'sleep' ? .75 : next.fullness <= LOW_NEED ? -.8 : -.35;
  return normalizeNeeds(next);
}

export function fatigueOpacity(elapsed, energy) {
  if (energy >= LOW_NEED || elapsed < 7000) return 0;
  const phase = (elapsed % 7000) / 1250;
  return phase < 1 ? Math.sin(phase * Math.PI) ** 2 * (.10 + .18 * (1 - energy / LOW_NEED)) : 0;
}

export function hungerOffset(elapsed, fullness) {
  if (fullness >= LOW_NEED || elapsed < 0 || elapsed % 2600 > 350) return 0;
  const phase = (elapsed % 2600) / 350;
  return Math.sin(phase * Math.PI * 7) * Math.sin(phase * Math.PI) * 2.6;
}
