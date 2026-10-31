import type { PlanState } from '../types'
import { STORAGE_KEY, parseSavedPlan } from './plan'

/** Reads the saved plan; a missing, unreadable or malformed entry is simply "no plan". */
export function loadPlan(): PlanState | null {
  try {
    return parseSavedPlan(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

export function savePlan(plan: PlanState | null): void {
  try {
    if (plan) localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private window, quota). The plan still works for this visit.
  }
}
