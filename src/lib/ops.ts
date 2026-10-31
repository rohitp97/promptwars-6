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

type Item = Record<string, unknown>
/** A validator returns the operation it accepts, or the reason it refuses. */
type Validator = (item: Item, today: string) => Op | string

const isId = (ids: Set<string>, v: unknown): v is string => typeof v === 'string' && ids.has(v)
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Validators for the operations whose single argument is a number. */
const numeric =
  (check: (value: number) => Op | string): Validator =>
  (item) =>
    isNumber(item.value) ? check(item.value) : 'needs a number'

const VALIDATORS: Record<Op['op'], Validator> = {
  set_budget: numeric((value) =>
    value < LIMITS.minBudget || value > LIMITS.maxBudget
      ? `budget ${formatINR(value)} is out of range`
      : { op: 'set_budget', value: Math.round(value) },
  ),
  adjust_budget_pct: numeric((value) =>
    value <= -90 || value > 500 ? 'percentage is out of range' : { op: 'adjust_budget_pct', value },
  ),
  set_guests: numeric((value) =>
    value < LIMITS.minGuests || value > LIMITS.maxGuests
      ? `${value} guests is out of range`
      : { op: 'set_guests', value: Math.round(value) },
  ),
  shift_event_days: numeric((value) =>
    !Number.isInteger(value) || Math.abs(value) > 730
      ? 'shift must be whole days, within 2 years'
      : { op: 'shift_event_days', value },
  ),
  set_event_date: (item, today) => {
    if (typeof item.value !== 'string' || !parseIso(item.value)) return 'not a valid date (need YYYY-MM-DD)'
    return item.value <= today ? 'the date must be in the future' : { op: 'set_event_date', value: item.value }
  },
  set_city: (item) =>
    isId(CITIES, item.value) ? { op: 'set_city', value: item.value as CityTier } : 'unknown city type',
  set_priority: (item) => {
    if (!isId(CATEGORY_IDS, item.category)) return 'unknown category'
    if (!isId(PRIORITIES, item.level)) return 'unknown priority level'
    return { op: 'set_priority', category: item.category as CategoryId, level: item.level as Priority }
  },
  add_function: (item) =>
    isId(FUNCTION_IDS, item.value) ? { op: 'add_function', value: item.value as FunctionId } : 'unknown function',
  remove_function: (item) => {
    if (!isId(FUNCTION_IDS, item.value)) return 'unknown function'
    if (item.value === 'wedding') return 'the wedding itself cannot be removed'
    return { op: 'remove_function', value: item.value as FunctionId }
  },
  mark_task_done: (item) =>
    isId(TASK_IDS, item.taskId) ? { op: 'mark_task_done', taskId: item.taskId } : 'unknown task',
  delay_task: (item) => {
    if (!isId(TASK_IDS, item.taskId)) return 'unknown task'
    if (typeof item.notBefore !== 'string' || !parseIso(item.notBefore)) return 'not a valid date'
    return { op: 'delay_task', taskId: item.taskId, notBefore: item.notBefore }
  },
}

const isKnownOp = (name: string): name is Op['op'] => Object.hasOwn(VALIDATORS, name)

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
    if (!isKnownOp(item.op)) {
      rejected.push(`${item.op}: not an operation the planner supports`)
      continue
    }
    const result = VALIDATORS[item.op](item, today)
    if (typeof result === 'string') rejected.push(`${item.op}: ${result}`)
    else ops.push(result)
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
