import type { Op } from '../types'
import { parseAmount } from './money'

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, ten: 10 }

function dayCount(text: string): number | null {
  const m = /(\d+|one|two|three|four|five|six|eight|ten)\s*(day|week|month)s?/i.exec(text)
  if (!m) return null
  const n = NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1])
  const unit = m[2].toLowerCase()
  return n * (unit === 'week' ? 7 : unit === 'month' ? 30 : 1)
}

/**
 * Rule-based reading of the most common changes, used when the AI is unavailable. It understands
 * far less than the model (budget, guests, moving the date earlier or later), but it uses the same
 * Op type, so everything downstream is identical.
 */
export function fallbackParseChange(text: string): Op[] {
  const ops: Op[] = []
  const lower = text.toLowerCase()

  const pct = /(?:budget|spend)[^.]*?(?:cut|reduce|drop|down|lower)[^.]*?(\d+)\s*%/i.exec(text)
  const pctUp = /(?:budget|spend)[^.]*?(?:increase|up|raise|more)[^.]*?(\d+)\s*%/i.exec(text)
  const budget =
    /budget[^\d₹]*(?:is|to|of|now|=|:)?\s*((?:₹|rs\.?)?\s*\d[\d,.]*\s*(?:crore|cr|lakhs?|lacs?|l|k)?)/i.exec(text)
  if (pct) ops.push({ op: 'adjust_budget_pct', value: -Number(pct[1]) })
  else if (pctUp) ops.push({ op: 'adjust_budget_pct', value: Number(pctUp[1]) })
  else if (budget) {
    const value = parseAmount(budget[1])
    if (value) ops.push({ op: 'set_budget', value })
  }

  const guests = /(\d{2,4})\s*(?:guests|people|persons|pax)/i.exec(text) ?? /guests?[^\d]{0,20}(\d{2,4})/i.exec(text)
  if (guests) ops.push({ op: 'set_guests', value: Number(guests[1]) })

  const days = dayCount(text)
  if (days !== null && /earlier|sooner|advance|pull(?:ed)? forward|bring forward|moved? up/.test(lower)) {
    ops.push({ op: 'shift_event_days', value: -days })
  } else if (days !== null && /later|postpone|delay|push(?:ed)? back|push(?:ed)? out/.test(lower)) {
    ops.push({ op: 'shift_event_days', value: days })
  }
  return ops
}
