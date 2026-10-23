import { CATEGORIES, FUNCTIONS } from '../data/benchmarks'
import type { CategoryId, ChangeEntry, PlanState, Priority, Profile } from '../types'
import { summarizeBudget } from './budget'
import { addDays, formatDate, parseIso } from './dates'
import { formatINR } from './money'
import { LIMITS } from './ops'
import { scheduleTasks } from './timeline'

export const STORAGE_KEY = 'shaadi-compass.plan.v1'

export function defaultPriorities(): Record<CategoryId, Priority> {
  return Object.fromEntries(CATEGORIES.map((c) => [c.id, 'normal'])) as Record<CategoryId, Priority>
}

export function newPlan(profile: Profile): PlanState {
  return { profile, tasks: {}, quotes: [], own: {}, checklist: {}, log: [] }
}

/** A worked example so the app is explorable in one click: 200 guests, four months out, food over decor. */
export function samplePlan(today: string): PlanState {
  return newPlan({
    budget: 15_00_000,
    guests: 200,
    eventDate: addDays(today, 120),
    city: 'tier2',
    functions: ['wedding', 'sangeet'],
    priorities: { ...defaultPriorities(), catering: 'splurge', decor: 'save' },
    vibe: 'Warm and family-first. Great food matters more than elaborate decor. Elders and young children attending.',
    mustHaves: 'Vegetarian menu, morning ceremony, space for elders to sit comfortably',
  })
}

export interface Snapshot {
  budget: number
  guests: number
  eventDate: string
  planned: number
  gap: number
  tasks: Record<string, { title: string; finish: string; health: string }>
}

export function snapshot(state: PlanState, today: string): Snapshot {
  const b = summarizeBudget(state)
  return {
    budget: state.profile.budget,
    guests: state.profile.guests,
    eventDate: state.profile.eventDate,
    planned: b.planned,
    gap: b.gap,
    tasks: Object.fromEntries(
      scheduleTasks(state, today).map((t) => [t.id, { title: t.title, finish: t.finish, health: t.health }]),
    ),
  }
}

/** Plain-language list of what a change did. Built from before/after numbers, never from model text. */
export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const lines: string[] = []
  if (before.budget !== after.budget) lines.push(`Budget ${formatINR(before.budget)} → ${formatINR(after.budget)}`)
  if (before.guests !== after.guests) lines.push(`Guests ${before.guests} → ${after.guests}`)
  if (before.eventDate !== after.eventDate) {
    lines.push(`Event date ${formatDate(before.eventDate)} → ${formatDate(after.eventDate)}`)
  }
  if (before.planned !== after.planned) {
    lines.push(`Planned spend ${formatINR(before.planned)} → ${formatINR(after.planned)}`)
  }
  if (before.gap !== after.gap) {
    const describe = (gap: number) => (gap > 0 ? `${formatINR(gap)} over` : `${formatINR(-gap)} under`)
    lines.push(`Against budget: ${describe(before.gap)} → ${describe(after.gap)}`)
  }
  const newlyRisky: string[] = []
  const recovered: string[] = []
  let moved = 0
  for (const [id, a] of Object.entries(after.tasks)) {
    const b = before.tasks[id]
    if (!b) continue
    const risky = (h: string) => h === 'at_risk' || h === 'overdue'
    if (risky(a.health) && !risky(b.health)) newlyRisky.push(a.title)
    if (!risky(a.health) && risky(b.health)) recovered.push(a.title)
    if (a.finish !== b.finish) moved++
  }
  if (moved > 0) lines.push(`${moved} task${moved === 1 ? '' : 's'} moved on the calendar`)
  if (newlyRisky.length > 0) lines.push(`Now at risk: ${newlyRisky.join('; ')}`)
  if (recovered.length > 0) lines.push(`No longer at risk: ${recovered.join('; ')}`)
  return lines
}

export function logEntry(text: string, now: Date = new Date()): ChangeEntry {
  return { at: now.toISOString(), text }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const FUNCTION_IDS = new Set<string>(FUNCTIONS.map((f) => f.id))

/** Reads a saved plan back from storage, rejecting anything that is not a well-formed plan. */
export function parseSavedPlan(raw: string | null): PlanState | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (!isRecord(data) || !isRecord(data.profile)) return null
    const p = data.profile
    if (
      typeof p.budget !== 'number' ||
      typeof p.guests !== 'number' ||
      typeof p.eventDate !== 'string' ||
      !parseIso(p.eventDate) ||
      !Array.isArray(p.functions) ||
      !p.functions.every((f) => typeof f === 'string' && FUNCTION_IDS.has(f)) ||
      !p.functions.includes('wedding') ||
      !isRecord(p.priorities) ||
      p.budget < LIMITS.minBudget ||
      p.guests < LIMITS.minGuests
    ) {
      return null
    }
    return {
      profile: { ...(p as unknown as Profile), priorities: { ...defaultPriorities(), ...(p.priorities as object) } },
      tasks: isRecord(data.tasks) ? (data.tasks as PlanState['tasks']) : {},
      quotes: Array.isArray(data.quotes) ? (data.quotes as PlanState['quotes']) : [],
      own: isRecord(data.own) ? (data.own as PlanState['own']) : {},
      checklist: isRecord(data.checklist) ? (data.checklist as PlanState['checklist']) : {},
      log: Array.isArray(data.log) ? (data.log as PlanState['log']) : [],
    }
  } catch {
    return null
  }
}
