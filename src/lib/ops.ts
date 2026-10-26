import { CATEGORIES, FUNCTIONS, TASK_TEMPLATES } from '../data/benchmarks'
import type { CategoryId, CityTier, FunctionId, Op, PlanState, Priority } from '../types'
import { addDays, formatDate, parseIso } from './dates'
import { formatINR } from './money'

export const LIMITS = { minBudget: 50_000, maxBudget: 50_00_00_000, minGuests: 10, maxGuests: 2000 } as const

const CATEGORY_IDS = new Set<string>(CATEGORIES.map((c) => c.id))
const FUNCTION_IDS = new Set<string>(FUNCTIONS.map((f) => f.id))
const TASK_IDS = new Set<string>(TASK_TEMPLATES.map((t) => t.id))
const CITIES = new Set<string>(['metro', 'tier2', 'tier3'])
const PRIORITIES = new Set<string>(['splurge', 'normal', 'save'])

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface ParsedOps {
  ops: Op[]
  rejected: string[]
}

/**
 * The model never edits the plan. It proposes operations from a closed list, and this function is
 * the only gate: unknown operations, out-of-range numbers, impossible dates and unknown ids are
 * rejected with a reason, so a confused (or manipulated) model cannot put the plan in a bad state.
 */
export function parseOps(raw: unknown, today: string): ParsedOps {
  const ops: Op[] = []
  const rejected: string[] = []
  if (!Array.isArray(raw)) return { ops, rejected: ['The reply had no list of changes.'] }

  for (const item of raw) {
    if (!isRecord(item) || typeof item.op !== 'string') {
      rejected.push('A change was malformed and was ignored.')
      continue
    }
    const reject = (why: string) => rejected.push(`${item.op}: ${why}`)
    switch (item.op) {
      case 'set_budget':
      case 'adjust_budget_pct':
      case 'set_guests':
      case 'shift_event_days': {
        const value = item.value
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          reject('needs a number')
          break
        }
        if (item.op === 'set_budget') {
          if (value < LIMITS.minBudget || value > LIMITS.maxBudget) reject(`budget ${formatINR(value)} is out of range`)
          else ops.push({ op: 'set_budget', value: Math.round(value) })
        } else if (item.op === 'adjust_budget_pct') {
          if (value <= -90 || value > 500) reject('percentage is out of range')
          else ops.push({ op: 'adjust_budget_pct', value })
        } else if (item.op === 'set_guests') {
          if (value < LIMITS.minGuests || value > LIMITS.maxGuests) reject(`${value} guests is out of range`)
          else ops.push({ op: 'set_guests', value: Math.round(value) })
        } else if (!Number.isInteger(value) || Math.abs(value) > 730) reject('shift must be whole days, within 2 years')
        else ops.push({ op: 'shift_event_days', value })
        break
      }
      case 'set_event_date': {
        if (typeof item.value !== 'string' || !parseIso(item.value)) reject('not a valid date (need YYYY-MM-DD)')
        else if (item.value <= today) reject('the date must be in the future')
        else ops.push({ op: 'set_event_date', value: item.value })
        break
      }
      case 'set_city': {
        if (typeof item.value !== 'string' || !CITIES.has(item.value)) reject('unknown city type')
        else ops.push({ op: 'set_city', value: item.value as CityTier })
        break
      }
      case 'set_priority': {
        if (typeof item.category !== 'string' || !CATEGORY_IDS.has(item.category)) reject('unknown category')
        else if (typeof item.level !== 'string' || !PRIORITIES.has(item.level)) reject('unknown priority level')
        else ops.push({ op: 'set_priority', category: item.category as CategoryId, level: item.level as Priority })
        break
      }
      case 'add_function':
      case 'remove_function': {
        if (typeof item.value !== 'string' || !FUNCTION_IDS.has(item.value)) reject('unknown function')
        else if (item.value === 'wedding' && item.op === 'remove_function')
          reject('the wedding itself cannot be removed')
        else ops.push({ op: item.op, value: item.value as FunctionId })
        break
      }
      case 'mark_task_done': {
        if (typeof item.taskId !== 'string' || !TASK_IDS.has(item.taskId)) reject('unknown task')
        else ops.push({ op: 'mark_task_done', taskId: item.taskId })
        break
      }
      case 'delay_task': {
        if (typeof item.taskId !== 'string' || !TASK_IDS.has(item.taskId)) reject('unknown task')
        else if (typeof item.notBefore !== 'string' || !parseIso(item.notBefore)) reject('not a valid date')
        else ops.push({ op: 'delay_task', taskId: item.taskId, notBefore: item.notBefore })
        break
      }
      default:
        rejected.push(`${String(item.op)}: not an operation the planner supports`)
    }
  }
  return { ops, rejected }
}

export function describeOp(op: Op, state: PlanState): string {
  const { profile } = state
  const label = (id: string) => CATEGORIES.find((c) => c.id === id)?.short ?? id
  const fnLabel = (id: string) => FUNCTIONS.find((f) => f.id === id)?.label ?? id
  switch (op.op) {
    case 'set_budget':
      return `Budget ${formatINR(profile.budget)} → ${formatINR(op.value)}`
    case 'adjust_budget_pct': {
      const next = Math.round((profile.budget * (100 + op.value)) / 100)
      return `Budget ${op.value > 0 ? '+' : ''}${op.value}%: ${formatINR(profile.budget)} → ${formatINR(next)}`
    }
    case 'set_guests':
      return `Guests ${profile.guests} → ${op.value}`
    case 'set_event_date':
      return `Event date ${formatDate(profile.eventDate)} → ${formatDate(op.value)}`
    case 'shift_event_days':
      return `Event ${Math.abs(op.value)} days ${op.value < 0 ? 'earlier' : 'later'}: ${formatDate(profile.eventDate)} → ${formatDate(addDays(profile.eventDate, op.value))}`
    case 'set_city':
      return `City type → ${op.value}`
    case 'set_priority':
      return `${label(op.category)}: ${profile.priorities[op.category]} → ${op.level}`
    case 'add_function':
      return `Add ${fnLabel(op.value)}`
    case 'remove_function':
      return `Remove ${fnLabel(op.value)}`
    case 'mark_task_done':
      return `Mark done: ${TASK_TEMPLATES.find((t) => t.id === op.taskId)?.title ?? op.taskId}`
    case 'delay_task':
      return `Delay "${TASK_TEMPLATES.find((t) => t.id === op.taskId)?.title ?? op.taskId}" until ${formatDate(op.notBefore)}`
  }
}

/** Applies one operation to a copy of the state. Pure: the caller decides whether to keep the result. */
export function applyOp(state: PlanState, op: Op, today: string): PlanState {
  const { profile } = state
  switch (op.op) {
    case 'set_budget':
      return { ...state, profile: { ...profile, budget: op.value } }
    case 'adjust_budget_pct':
      return { ...state, profile: { ...profile, budget: Math.round((profile.budget * (100 + op.value)) / 100) } }
    case 'set_guests':
      return { ...state, profile: { ...profile, guests: op.value } }
    case 'set_event_date':
      return { ...state, profile: { ...profile, eventDate: op.value } }
    case 'shift_event_days': {
      const eventDate = addDays(profile.eventDate, op.value)
      return { ...state, profile: { ...profile, eventDate: eventDate > today ? eventDate : addDays(today, 1) } }
    }
    case 'set_city':
      return { ...state, profile: { ...profile, city: op.value } }
    case 'set_priority':
      return { ...state, profile: { ...profile, priorities: { ...profile.priorities, [op.category]: op.level } } }
    case 'add_function':
      return profile.functions.includes(op.value)
        ? state
        : { ...state, profile: { ...profile, functions: [...profile.functions, op.value] } }
    case 'remove_function':
      return { ...state, profile: { ...profile, functions: profile.functions.filter((f) => f !== op.value) } }
    case 'mark_task_done':
      return { ...state, tasks: { ...state.tasks, [op.taskId]: { status: 'done', doneOn: today } } }
    case 'delay_task':
      return {
        ...state,
        tasks: { ...state.tasks, [op.taskId]: { ...state.tasks[op.taskId], status: 'todo', notBefore: op.notBefore } },
      }
  }
}

export function applyOps(state: PlanState, ops: Op[], today: string): PlanState {
  return ops.reduce((s, op) => applyOp(s, op, today), state)
}
