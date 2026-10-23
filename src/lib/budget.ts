import {
  ATTIRE_BASE,
  CATEGORIES,
  CONTINGENCY_SHARE,
  DECOR_BASE,
  ENTERTAINMENT_BASE,
  INVITES_PER_GUEST,
  PHOTO_BASE,
  PLATE_RATE,
  PRIORITY_MULTIPLIER,
  RANGE_HIGH,
  RANGE_LOW,
  SANGEET_ENTERTAINMENT_MULTIPLIER,
  STAY_PER_GUEST,
  VENUE_PER_GUEST,
  functionInfo,
} from '../data/benchmarks'
import type { BudgetSummary, CategoryId, CategoryLine, Money, PlanState, Priority, Profile } from '../types'
import { quoteTotal, quoteUnits } from './quotes'

/** How strongly a priority pulls budget share toward or away from a category. */
const ALLOCATION_WEIGHT: Record<Priority, number> = { splurge: 1.4, normal: 1, save: 0.7 }

const roundTo = (n: number, step: number) => Math.round(n / step) * step

/** Middle estimate for a category: typical cost for this city, guest count and function mix. */
export function estimateMid(profile: Profile, id: CategoryId): number {
  const { city, guests, functions } = profile
  const infos = functions.map(functionInfo)
  const sum = (pick: (f: (typeof infos)[number]) => number) => infos.reduce((acc, f) => acc + pick(f), 0)
  const mult = PRIORITY_MULTIPLIER[profile.priorities[id]]
  let raw: number
  switch (id) {
    case 'catering':
      raw = PLATE_RATE[city] * guests * sum((f) => f.meal)
      break
    case 'venue':
      raw = VENUE_PER_GUEST[city] * guests * sum((f) => f.venue)
      break
    case 'decor':
      raw = DECOR_BASE[city] * Math.sqrt(guests / 200) * sum((f) => f.decor)
      break
    case 'photo':
      raw = PHOTO_BASE[city] * (1 + 0.3 * (infos.length - 1))
      break
    case 'attire':
      raw = ATTIRE_BASE[city] * (1 + 0.1 * (infos.length - 1))
      break
    case 'entertainment':
      raw = ENTERTAINMENT_BASE[city] * (functions.includes('sangeet') ? SANGEET_ENTERTAINMENT_MULTIPLIER : 1)
      break
    case 'invites':
      raw = INVITES_PER_GUEST[city] * guests
      break
    case 'stay':
      raw = STAY_PER_GUEST[city] * guests
      break
  }
  return roundTo(raw * mult, 1000)
}

/**
 * What the plan allows per category: the budget minus the reserve, shared out in proportion to what
 * each category typically costs for this city, guest count and function mix (at a standard level),
 * then tilted toward the categories the family said matter most and away from those they would save on.
 */
export function allocate(profile: Profile): Record<CategoryId, number> {
  const pool = profile.budget * (1 - CONTINGENCY_SHARE)
  const standard = {
    ...profile,
    priorities: Object.fromEntries(CATEGORIES.map((c) => [c.id, 'normal'])) as Profile['priorities'],
  }
  const weights = CATEGORIES.map((c) => estimateMid(standard, c.id) * ALLOCATION_WEIGHT[profile.priorities[c.id]])
  const total = weights.reduce((a, b) => a + b, 0)
  const out = {} as Record<CategoryId, number>
  CATEGORIES.forEach((c, i) => {
    out[c.id] = roundTo((pool * weights[i]) / total, 1000)
  })
  return out
}

/** The figure used for a category in totals, with its origin: booked quote > your figure > estimate. */
export function effectiveFor(state: PlanState, id: CategoryId, mid: number): Money {
  const { profile } = state
  const booked = state.quotes.find((q) => q.category === id && q.status === 'booked')
  if (booked) {
    const units = quoteUnits(booked, booked.data, profile.functions)
    return { value: quoteTotal(booked.data, profile.guests, units).high, provenance: 'quote' }
  }
  const own = state.own[id]
  if (own !== undefined) return { value: own, provenance: 'you' }
  return { value: mid, provenance: 'estimate' }
}

export function summarizeBudget(state: PlanState): BudgetSummary {
  const { profile } = state
  const alloc = allocate(profile)
  const lines: CategoryLine[] = CATEGORIES.map((c) => {
    const mid = estimateMid(profile, c.id)
    return {
      id: c.id,
      allocation: alloc[c.id],
      low: roundTo(mid * RANGE_LOW, 1000),
      mid,
      high: roundTo(mid * RANGE_HIGH, 1000),
      effective: effectiveFor(state, c.id, mid),
    }
  })
  const contingency = roundTo(profile.budget * CONTINGENCY_SHARE, 1000)
  const spent = lines.reduce((acc, l) => acc + l.effective.value, 0)
  const backed = lines.filter((l) => l.effective.provenance !== 'estimate').reduce((a, l) => a + l.effective.value, 0)
  return {
    lines,
    contingency,
    planned: spent + contingency,
    budget: profile.budget,
    gap: spent + contingency - profile.budget,
    confidence: spent > 0 ? backed / spent : 0,
  }
}
