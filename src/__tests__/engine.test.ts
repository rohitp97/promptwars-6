import { describe, expect, it } from 'vitest'
import { allocate, estimateMid, summarizeBudget } from '../lib/budget'
import { addDays, daysBetween, parseIso } from '../lib/dates'
import { fallbackParseChange } from '../lib/fallbackParse'
import { buildIcs, escapeIcs } from '../lib/ics'
import { allAmounts, formatINR, groupIndian, parseAmount } from '../lib/money'
import { applyOps, parseOps } from '../lib/ops'
import { diffSnapshots, parseSavedPlan, samplePlan, snapshot } from '../lib/plan'
import { checkExtraction, compareQuote, quoteTotal } from '../lib/quotes'
import { scheduleTasks, summarizeTimeline } from '../lib/timeline'
import { buildTradeoffs } from '../lib/tradeoffs'
import { parseQuoteJson, ideaFit, parseIdeas } from '../lib/aiTasks'
import type { ExtractedQuote, PlanState, Quote } from '../types'

const TODAY = '2026-10-23'
const sample = (): PlanState => samplePlan(TODAY)

describe('money', () => {
  it('formats rupees compactly with Indian grouping', () => {
    expect(groupIndian(1234567)).toBe('12,34,567')
    expect(formatINR(45000)).toBe('₹45,000')
    expect(formatINR(850000)).toBe('₹8.5 L')
    expect(formatINR(12000000)).toBe('₹1.2 Cr')
    expect(formatINR(-200000)).toBe('-₹2 L')
  })
  it('parses the ways people write amounts', () => {
    expect(parseAmount('8 lakh')).toBe(800000)
    expect(parseAmount('₹8,00,000')).toBe(800000)
    expect(parseAmount('1.2 cr')).toBe(12000000)
    expect(parseAmount('45k')).toBe(45000)
    expect(parseAmount('nothing here')).toBeNull()
  })
  it('lists every amount in a text', () => {
    expect(allAmounts('Rs. 1,200 per plate, advance 50000')).toEqual(expect.arrayContaining([1200, 50000]))
  })
})

describe('dates', () => {
  it('adds days across month ends and leap years', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(daysBetween('2026-10-23', '2027-02-20')).toBe(120)
  })
  it('rejects impossible dates', () => {
    expect(parseIso('2026-02-30')).toBeNull()
    expect(parseIso('tomorrow')).toBeNull()
  })
})

describe('budget', () => {
  it('splits the budget minus the reserve across categories', () => {
    const p = sample().profile
    const total = Object.values(allocate(p)).reduce((a, b) => a + b, 0)
    expect(Math.abs(total - p.budget * 0.9)).toBeLessThan(10_000)
  })
  it('splurge categories get more allocation and cost more than save categories', () => {
    const p = sample().profile
    const alloc = allocate(p)
    expect(alloc.catering).toBeGreaterThan(alloc.decor)
    const normal = estimateMid({ ...p, priorities: { ...p.priorities, catering: 'normal' } }, 'catering')
    expect(estimateMid(p, 'catering')).toBeGreaterThan(normal)
  })
  it('catering scales with guests and meals', () => {
    const p = sample().profile
    expect(estimateMid({ ...p, guests: 400 }, 'catering')).toBeCloseTo(estimateMid(p, 'catering') * 2, -4)
    expect(estimateMid({ ...p, functions: ['wedding'] }, 'catering')).toBeLessThan(estimateMid(p, 'catering'))
  })
  it('labels everything as estimate until a quote or own figure is used', () => {
    const b = summarizeBudget(sample())
    expect(b.lines.every((l) => l.effective.provenance === 'estimate')).toBe(true)
    expect(b.confidence).toBe(0)
    const s = { ...sample(), own: { photo: 90_000 } }
    const line = summarizeBudget(s).lines.find((l) => l.id === 'photo')
    expect(line?.effective).toEqual({ value: 90_000, provenance: 'you' })
  })
})

const catererQuote = (status: Quote['status'] = 'booked'): Quote => ({
  id: 'q1',
  category: 'catering',
  status,
  rawText: '',
  data: {
    vendor: 'Spice Route',
    basis: 'per_plate',
    amount: 800,
    gstIncluded: null,
    guestsCovered: null,
    advance: null,
    validTill: null,
    inclusions: [],
    exclusions: [],
    extraCharges: [],
  },
  check: { amountFound: true, inclusionsVerified: [], removed: [] },
})

describe('quotes', () => {
  it('scales per-plate quotes to the guest count and adds a GST range when unstated', () => {
    const t = quoteTotal(catererQuote().data, 200)
    expect(t.base).toBe(160_000)
    expect(t.low).toBe(168_000)
    expect(t.high).toBe(188_800)
    expect(quoteTotal({ ...catererQuote().data, gstIncluded: true }, 200).high).toBe(160_000)
  })
  it('a booked quote replaces the estimate and the total re-prices if guests change', () => {
    const s = { ...sample(), quotes: [catererQuote()] }
    const line = summarizeBudget(s).lines.find((l) => l.id === 'catering')
    expect(line?.effective.provenance).toBe('quote')
    const fewer = { ...s, profile: { ...s.profile, guests: 100 } }
    const line2 = summarizeBudget(fewer).lines.find((l) => l.id === 'catering')
    expect(line2?.effective.value).toBeCloseTo((line?.effective.value ?? 0) / 2, -2)
  })
  it('shortlisted quotes do not change the budget', () => {
    const s = { ...sample(), quotes: [catererQuote('shortlisted')] }
    expect(summarizeBudget(s).lines.find((l) => l.id === 'catering')?.effective.provenance).toBe('estimate')
  })
  it('flags a quote that is far below the typical range and lists what it does not say', () => {
    const data = { ...catererQuote().data, amount: 200 }
    const cmp = compareQuote(data, 'catering', 200, 250_000, 200_000)
    expect(cmp.verdict).toBe('suspiciously_low')
    expect(cmp.gaps.join(' ')).toMatch(/GST/)
    expect(cmp.gaps.join(' ')).toMatch(/advance/i)
  })
  it('removes extracted items the pasted text does not support', () => {
    const raw = 'Veg buffet Rs. 800 per plate. Includes live chaat counter and service staff. Liquor not included.'
    const data: ExtractedQuote = {
      ...catererQuote().data,
      inclusions: ['live chaat counter', 'service staff', 'free dessert bar with ice sculpture'],
      exclusions: ['liquor'],
    }
    const { data: checked, check } = checkExtraction(raw, data)
    expect(check.amountFound).toBe(true)
    expect(checked.inclusions).toEqual(['live chaat counter', 'service staff'])
    expect(check.removed).toEqual(['free dessert bar with ice sculpture'])
  })
  it('does not trust a price that is not in the text', () => {
    expect(checkExtraction('Veg buffet, ask for rate', catererQuote().data).check.amountFound).toBe(false)
  })
  it('parses model JSON defensively', () => {
    expect(parseQuoteJson({ amount: -5 })).toBeNull()
    expect(parseQuoteJson({ amount: 1200, basis: 'weird', validTill: 'next week' })).toMatchObject({
      basis: 'flat',
      validTill: null,
    })
  })
})

describe('timeline', () => {
  it('schedules dependencies after their prerequisites', () => {
    const tasks = scheduleTasks(sample(), TODAY)
    const byId = Object.fromEntries(tasks.map((t) => [t.id, t]))
    expect(byId.venue.start >= byId.guestlist.finish).toBe(true)
    expect(byId.caterer.start >= byId.venue.finish).toBe(true)
  })
  it('omits function-specific tasks when the function is dropped', () => {
    const s = sample()
    expect(scheduleTasks(s, TODAY).some((t) => t.id === 'entertainment')).toBe(true)
    const noSangeet = { ...s, profile: { ...s.profile, functions: ['wedding' as const] } }
    expect(scheduleTasks(noSangeet, TODAY).some((t) => t.id === 'entertainment')).toBe(false)
  })
  it('moving the date earlier puts tasks at risk, and later recovers them', () => {
    const s = sample()
    const near = { ...s, profile: { ...s.profile, eventDate: addDays(TODAY, 45) } }
    expect(summarizeTimeline(scheduleTasks(near, TODAY), near.profile.eventDate, TODAY).atRisk).toBeGreaterThan(0)
    const far = { ...s, profile: { ...s.profile, eventDate: addDays(TODAY, 400) } }
    const t = summarizeTimeline(scheduleTasks(far, TODAY), far.profile.eventDate, TODAY)
    expect(t.atRisk + t.overdue).toBe(0)
  })
  it('a delayed task pushes its dependents', () => {
    const s = sample()
    const before = scheduleTasks(s, TODAY).find((t) => t.id === 'caterer')!
    const delayed = { ...s, tasks: { venue: { status: 'todo' as const, notBefore: addDays(TODAY, 60) } } }
    const after = scheduleTasks(delayed, TODAY).find((t) => t.id === 'caterer')!
    expect(after.start > before.start).toBe(true)
  })
  it('a finished task no longer holds up what depends on it', () => {
    const s = sample()
    const done = { ...s, tasks: { budget: { status: 'done' as const, doneOn: TODAY } } }
    const g = scheduleTasks(done, TODAY).find((t) => t.id === 'guestlist')!
    expect(g.start).toBe(TODAY)
  })
  it('an unfinished task past its due date is overdue', () => {
    const s = sample()
    const late = { ...s, profile: { ...s.profile, eventDate: addDays(TODAY, 60) } }
    const budget = scheduleTasks(late, TODAY).find((t) => t.id === 'budget')!
    expect(budget.health).toBe('overdue')
  })
})

describe('ops', () => {
  it('accepts valid operations and rejects invalid ones with a reason', () => {
    const { ops, rejected } = parseOps(
      [
        { op: 'set_budget', value: 600000 },
        { op: 'set_guests', value: 5 },
        { op: 'set_event_date', value: '2020-01-01' },
        { op: 'set_event_date', value: 'soon' },
        { op: 'remove_function', value: 'wedding' },
        { op: 'format_disk' },
        { op: 'set_priority', category: 'decor', level: 'save' },
        { op: 'mark_task_done', taskId: 'nope' },
      ],
      TODAY,
    )
    expect(ops).toEqual([
      { op: 'set_budget', value: 600000 },
      { op: 'set_priority', category: 'decor', level: 'save' },
    ])
    expect(rejected).toHaveLength(6)
  })
  it('applies a budget cut and a date change together', () => {
    const s = sample()
    const next = applyOps(
      s,
      [
        { op: 'adjust_budget_pct', value: -25 },
        { op: 'shift_event_days', value: -14 },
      ],
      TODAY,
    )
    expect(next.profile.budget).toBe(1125000)
    expect(next.profile.eventDate).toBe(addDays(s.profile.eventDate, -14))
  })
  it('never moves the event into the past', () => {
    const next = applyOps(sample(), [{ op: 'shift_event_days', value: -700 }], TODAY)
    expect(next.profile.eventDate > TODAY).toBe(true)
  })
  it('the model cannot return a non-list', () => {
    expect(parseOps({ op: 'set_budget' }, TODAY).ops).toEqual([])
  })
})

describe('fallback parser', () => {
  it('reads the challenge-brief scenario without AI', () => {
    expect(
      fallbackParseChange('We have a 50% cut... actually budget cut by 20%, and the wedding is 2 weeks earlier'),
    ).toEqual([
      { op: 'adjust_budget_pct', value: -20 },
      { op: 'shift_event_days', value: -14 },
    ])
    expect(fallbackParseChange('guests are now 150 people')).toEqual([{ op: 'set_guests', value: 150 }])
    expect(fallbackParseChange('our budget is now 6 lakh')).toEqual([{ op: 'set_budget', value: 600000 }])
    expect(fallbackParseChange('hello there')).toEqual([])
  })
})

describe('tradeoffs', () => {
  it('computes savings by re-running the budget engine', () => {
    const s = sample()
    const base = summarizeBudget(s).planned
    const options = buildTradeoffs(s)
    expect(options.length).toBeGreaterThan(3)
    for (const o of options) {
      const after = summarizeBudget({ ...s, profile: { ...s.profile, ...o.patch } }).planned
      expect(base - after).toBe(o.saving)
      expect(o.saving).toBeGreaterThan(0)
    }
    expect(options[0].saving).toBeGreaterThanOrEqual(options[options.length - 1].saving)
  })
})

describe('plan state', () => {
  it('summarises a replan in plain language', () => {
    const s = sample()
    const after = applyOps(
      s,
      [
        { op: 'adjust_budget_pct', value: -50 },
        { op: 'shift_event_days', value: -90 },
      ],
      TODAY,
    )
    const lines = diffSnapshots(snapshot(s, TODAY), snapshot(after, TODAY))
    expect(lines.join('\n')).toMatch(/Budget/)
    expect(lines.join('\n')).toMatch(/Now at risk/)
  })
  it('rejects corrupted saved plans', () => {
    expect(parseSavedPlan('not json')).toBeNull()
    expect(parseSavedPlan(JSON.stringify({ profile: { budget: 10 } }))).toBeNull()
    expect(parseSavedPlan(JSON.stringify(sample()))?.profile.guests).toBe(200)
  })
})

describe('ideas', () => {
  it('drops ideas without a numeric cost and classifies fit in code', () => {
    const ideas = parseIdeas(
      { ideas: [{ title: 'A', estCost: 50000 }, { title: 'B' }, { title: 'C', estCost: 'lots' }] },
      'decor',
    )
    expect(ideas).toHaveLength(1)
    expect(ideaFit(50000, 60000)).toBe('fits')
    expect(ideaFit(70000, 60000)).toBe('stretch')
    expect(ideaFit(90000, 60000)).toBe('over')
  })
})

describe('ics', () => {
  it('escapes special characters and lists open tasks only', () => {
    expect(escapeIcs('a,b;c')).toBe('a\\,b\\;c')
    const s = { ...sample(), tasks: { budget: { status: 'done' as const, doneOn: TODAY } } }
    const ics = buildIcs(scheduleTasks(s, TODAY), s.profile.eventDate, TODAY)
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).not.toContain('task-budget@')
    expect(ics).toContain('task-venue@')
  })
})

describe('quote units', () => {
  it('multiplies a caterer per-plate rate by the meals across functions unless scoped to one meal', async () => {
    const { quoteUnits } = await import('../lib/quotes')
    const q = catererQuote()
    expect(quoteUnits(q, q.data, ['wedding'])).toBe(1)
    expect(quoteUnits(q, q.data, ['wedding', 'sangeet'])).toBe(1.8)
    expect(quoteUnits({ ...q, scope: 'one' }, q.data, ['wedding', 'sangeet'])).toBe(1)
    expect(quoteUnits({ ...q, category: 'venue' }, { ...q.data, basis: 'flat' }, ['wedding', 'sangeet'])).toBe(1)
  })
  it('a booked per-plate quote covers every meal in the budget line', () => {
    const s = { ...sample(), quotes: [catererQuote()] }
    const line = summarizeBudget(s).lines.find((l) => l.id === 'catering')
    // 800 x 200 guests x 1.8 meals x 1.18 (top of assumed GST range)
    expect(line?.effective.value).toBe(Math.round(800 * 200 * 1.8 * 1.18))
  })
})
