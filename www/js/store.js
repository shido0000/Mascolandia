import { Preferences } from "@capacitor/preferences";

const KEY = "mascolandia_state_v1";

export const FREE_LIMITS = { pets: 1, healthRecords: 10 };

const defaultState = () => ({
  settings: { lang: "es", theme: "system", notifications: true },
  pets: [],
  activePetId: null,
  health: [],
  routines: [],
  expenses: [],
  consults: [],
  subscription: { plan: "free", since: null, renews: null },
  purchases: {},
  routineLog: {},
});

let state = defaultState();
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
}

export function notify() {
  for (const fn of listeners) fn(state);
}

export async function loadState() {
  let raw = null;
  try {
    const res = await Preferences.get({ key: KEY });
    raw = res.value;
  } catch {
    raw = localStorage.getItem(KEY);
  }
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      state = { ...defaultState(), ...parsed };
      state.settings = { ...defaultState().settings, ...parsed.settings };
      state.subscription = { ...defaultState().subscription, ...parsed.subscription };
      state.purchases = parsed.purchases || {};
    } catch {
      state = defaultState();
    }
  }
  return state;
}

export async function persist() {
  const raw = JSON.stringify(state);
  try {
    await Preferences.set({ key: KEY, value: raw });
  } catch {
    localStorage.setItem(KEY, raw);
  }
}

export function update(mutator) {
  mutator(state);
  persist();
  notify();
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function isPremium() {
  return state.subscription.plan !== "free";
}

export function activePet() {
  return state.pets.find((p) => p.id === state.activePetId) || state.pets[0] || null;
}

export function petById(id) {
  return state.pets.find((p) => p.id === id) || null;
}

export function consultCredits() {
  return state.purchases["cons.pack1"] || 0;
}

export function exportJson() {
  return JSON.stringify(state, null, 2);
}

export function replaceState(next) {
  state = { ...defaultState(), ...next };
  persist();
  notify();
}
