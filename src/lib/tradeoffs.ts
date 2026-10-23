import { CATEGORIES, FUNCTIONS } from '../data/benchmarks'
import type { PlanState, Profile, Tradeoff } from '../types'
import { summarizeBudget } from './budget'

const withProfile = (state: PlanState, patch: Partial<Profile>): PlanState => ({
  ...state,
  profile: { ...state.profile, ...patch },
})

/**
 * Concrete ways to close a budget gap. Savings are not asked of the model: each option is applied
 * to a copy of the plan and the budget engine is re-run, so the number shown is exactly what the
 * plan would show if the user picks it. The model may later explain or reword, never size, an option.
 */
export function buildTradeoffs(state: PlanState): Tradeoff[] {
  const base = summarizeBudget(state).planned
  const { profile } = state
  const options: Tradeoff[] = []
  const add = (t: Omit<Tradeoff, 'saving'>) => {
    const saving = base - summarizeBudget(withProfile(state, t.patch)).planned
    if (saving > 0) options.push({ ...t, saving })
  }

  for (const pct of [10, 20]) {
    const guests = Math.max(10, Math.round((profile.guests * (100 - pct)) / 100 / 10) * 10)
    if (guests >= profile.guests) continue
    add({
      id: `guests-${pct}`,
      kind: 'guests',
      title: `Trim the guest list by ${pct}% to ${guests}`,
      detail: 'Cuts food, venue, decor, invites and stay together. Usually the biggest single lever.',
      patch: { guests },
    })
  }

  for (const fn of profile.functions) {
    if (fn === 'wedding') continue
    const label = FUNCTIONS.find((f) => f.id === fn)?.label ?? fn
    add({
      id: `drop-${fn}`,
      kind: 'drop_function',
      title: `Fold the ${label.toLowerCase()} into another day`,
      detail: 'Removes its meal, venue share and decor. Photo and music costs fall too.',
      patch: { functions: profile.functions.filter((f) => f !== fn) },
    })
  }

  for (const cat of CATEGORIES) {
    const level = profile.priorities[cat.id]
    if (level === 'splurge') {
      add({
        id: `normal-${cat.id}`,
        kind: 'normal_category',
        title: `Spend at a standard level on ${cat.short.toLowerCase()}`,
        detail: 'Stops treating it as a splurge.',
        patch: { priorities: { ...profile.priorities, [cat.id]: 'normal' } },
      })
    } else if (level === 'normal') {
      add({
        id: `save-${cat.id}`,
        kind: 'save_category',
        title: `Go lean on ${cat.short.toLowerCase()}`,
        detail: 'A simpler version of this item, about a quarter less than standard.',
        patch: { priorities: { ...profile.priorities, [cat.id]: 'save' } },
      })
    }
  }

  return options.sort((a, b) => b.saving - a.saving)
}
