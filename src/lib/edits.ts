import type { CategoryId, PlanState, Priority, Profile, Quote, QuoteStatus } from '../types'

/**
 * Every way the user can edit a plan, as pure `(state, ...args) => state` functions. The hook only
 * wires these to React state, so each rule (such as "only one booked quote per category") is tested
 * without rendering anything.
 */

export function patchProfile(state: PlanState, patch: Partial<Profile>): PlanState {
  return { ...state, profile: { ...state.profile, ...patch } }
}

export function setPriority(state: PlanState, category: CategoryId, level: Priority): PlanState {
  return patchProfile(state, { priorities: { ...state.profile.priorities, [category]: level } })
}

/** A figure the user typed replaces the estimate for a category; null puts the estimate back. */
export function setOwnFigure(state: PlanState, category: CategoryId, value: number | null): PlanState {
  const own = { ...state.own }
  if (value === null) delete own[category]
  else own[category] = value
  return { ...state, own }
}

export function toggleTask(state: PlanState, taskId: string, today: string): PlanState {
  const done = state.tasks[taskId]?.status === 'done'
  const next = done ? { status: 'todo' as const } : { status: 'done' as const, doneOn: today }
  return { ...state, tasks: { ...state.tasks, [taskId]: next } }
}

/** "Can't start before <date>"; null clears the delay. Either way the task is open again. */
export function delayTask(state: PlanState, taskId: string, notBefore: string | null): PlanState {
  const next = notBefore ? { status: 'todo' as const, notBefore } : { status: 'todo' as const }
  return { ...state, tasks: { ...state.tasks, [taskId]: next } }
}

export function addQuote(state: PlanState, quote: Quote): PlanState {
  return { ...state, quotes: [...state.quotes, quote] }
}

/** Booking a quote demotes any other booked quote in the same category, so the budget has one source. */
export function setQuoteStatus(state: PlanState, id: string, status: QuoteStatus): PlanState {
  const target = state.quotes.find((q) => q.id === id)
  if (!target) return state
  return {
    ...state,
    quotes: state.quotes.map((q) => {
      if (q.id === id) return { ...q, status }
      const displaced = status === 'booked' && q.category === target.category && q.status === 'booked'
      return displaced ? { ...q, status: 'shortlisted' as const } : q
    }),
  }
}

export function setQuoteScope(state: PlanState, id: string, scope: 'all' | 'one'): PlanState {
  return { ...state, quotes: state.quotes.map((q) => (q.id === id ? { ...q, scope } : q)) }
}

export function removeQuote(state: PlanState, id: string): PlanState {
  return { ...state, quotes: state.quotes.filter((q) => q.id !== id) }
}

export function toggleChecklist(state: PlanState, key: string): PlanState {
  return { ...state, checklist: { ...state.checklist, [key]: !state.checklist[key] } }
}
