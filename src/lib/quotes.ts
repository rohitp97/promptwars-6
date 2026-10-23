import type { CategoryId, ExtractedQuote, FunctionId, Quote, QuoteCheck } from '../types'
import { mealCount } from '../data/benchmarks'
import { allAmounts } from './money'
import { daysBetween, parseIso } from './dates'

/** Case, whitespace and punctuation-insensitive form used to look for text inside a quote. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^\p{L}\p{N}₹%]+/gu, ' ')
    .trim()
}

/**
 * The model's reading of a vendor quote is checked against the pasted text before it is trusted:
 * the price must literally appear, and each inclusion has to be found in the text (by its words).
 * Items the text does not support are removed, never shown as if the vendor had promised them.
 */
export function checkExtraction(rawText: string, data: ExtractedQuote): { data: ExtractedQuote; check: QuoteCheck } {
  const amountFound = allAmounts(rawText).some((a) => a === data.amount)
  const haystack = normalizeText(rawText)
  const supported = (item: string) => {
    const words = normalizeText(item)
      .split(' ')
      .filter((w) => w.length > 2)
    if (words.length === 0) return false
    const hits = words.filter((w) => haystack.includes(w)).length
    return hits / words.length >= 0.6
  }
  const inclusionsVerified: string[] = []
  const removed: string[] = []
  for (const item of data.inclusions) (supported(item) ? inclusionsVerified : removed).push(item)
  const exclusions = data.exclusions.filter((item) => {
    const ok = supported(item)
    if (!ok) removed.push(item)
    return ok
  })
  const extraCharges = data.extraCharges.filter((c) => {
    const ok = supported(c.label)
    if (!ok) removed.push(c.label)
    return ok
  })
  return {
    data: { ...data, inclusions: inclusionsVerified, exclusions, extraCharges },
    check: { amountFound, inclusionsVerified, removed },
  }
}

/** GST range applied when a quote does not say whether tax is included. Confirm with the vendor. */
export const GST_ASSUMED_LOW = 0.05
export const GST_ASSUMED_HIGH = 0.18

export interface QuoteTotal {
  /** Base amount for the current guest count, before any tax not stated in the quote. */
  base: number
  /** Range when GST status is unknown; equal to base when the quote says GST is included. */
  low: number
  high: number
  /** Plates or people the price is scaled to; null for flat prices. */
  scaledTo: number | null
  /** Meals (per-plate prices) or days (per-day prices) the price is multiplied by. */
  units: number
}

/**
 * How many times the unit price applies. A caterer's per-plate rate normally covers every meal of every
 * function, so it is multiplied by the meals across the plan unless the user says it is for one meal.
 */
export function quoteUnits(
  quote: Pick<Quote, 'category' | 'scope'>,
  data: ExtractedQuote,
  functions: FunctionId[],
): number {
  if (data.basis === 'per_day') return Math.max(1, functions.length)
  if (data.basis === 'per_plate' && quote.category === 'catering' && quote.scope !== 'one') {
    return Math.round(mealCount(functions) * 10) / 10
  }
  return 1
}

/** What a quote costs for the guest count in the plan. Per-plate prices are scaled; flat ones are not. */
export function quoteTotal(data: ExtractedQuote, guests: number, units: number = 1): QuoteTotal {
  let base = data.amount
  let scaledTo: number | null = null
  if (data.basis === 'per_plate' || data.basis === 'per_person') {
    scaledTo = guests
    base = data.amount * guests * units
  } else if (data.basis === 'per_day') {
    base = data.amount * Math.max(1, units)
  }
  if (data.gstIncluded === true) return { base, low: base, high: base, scaledTo, units }
  return {
    base,
    low: Math.round(base * (1 + GST_ASSUMED_LOW)),
    high: Math.round(base * (1 + GST_ASSUMED_HIGH)),
    scaledTo,
    units,
  }
}

export type QuoteVerdict = 'within' | 'over' | 'suspiciously_low'

export interface QuoteComparison {
  total: QuoteTotal
  verdict: QuoteVerdict
  /** high - allocation; positive means the quote may exceed what the plan allows here */
  overBy: number
  /** Things the quote does not say that the checklist says to ask about, derived by code. */
  gaps: string[]
}

/** Fields every quote should answer. A missing one becomes a concrete question, not a guess. */
export function quoteGaps(data: ExtractedQuote, category: CategoryId): string[] {
  const gaps: string[] = []
  if (data.gstIncluded === null) gaps.push('Is GST included? (Add 5-18% if not.)')
  if (data.gstIncluded === false)
    gaps.push('What GST rate applies on top? The quote says GST is extra but not the rate.')
  if (data.advance === null) gaps.push('How much advance, and when are the balance instalments due?')
  if (data.validTill === null) gaps.push('Until when is this price valid?')
  if (data.inclusions.length === 0) gaps.push('What exactly is included? The quote does not list it.')
  if (data.exclusions.length === 0) gaps.push('What is NOT included? The quote does not list exclusions.')
  if ((category === 'catering' || category === 'venue') && data.guestsCovered === null) {
    gaps.push('For how many guests is this price, and what is the rate for extra guests?')
  }
  return gaps
}

export function compareQuote(
  data: ExtractedQuote,
  category: CategoryId,
  guests: number,
  allocation: number,
  estimateLow: number,
  units: number = 1,
): QuoteComparison {
  const total = quoteTotal(data, guests, units)
  const overBy = total.high - allocation
  let verdict: QuoteVerdict = 'within'
  if (total.low > allocation) verdict = 'over'
  else if (total.base < estimateLow * 0.6) verdict = 'suspiciously_low'
  return { total, verdict, overBy, gaps: quoteGaps(data, category) }
}

/** Expired or about to expire relative to a given day; null when the quote has no validity date. */
export function validityDaysLeft(quote: Quote, today: string): number | null {
  const until = quote.data.validTill
  if (!until || !parseIso(until)) return null
  return daysBetween(today, until)
}
