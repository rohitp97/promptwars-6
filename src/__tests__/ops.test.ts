import { describe, expect, it } from 'vitest'
import { withTimeout } from '../lib/withTimeout'
import { addDays } from '../lib/dates'
import { applyOp, applyOps, describeOp, parseOps } from '../lib/ops'
import { samplePlan } from '../lib/plan'
import type { Op } from '../types'

const TODAY = '2026-10-23'
const plan = () => samplePlan(TODAY)

describe('parseOps: every operation, valid and invalid', () => {
  const ok = (raw: unknown) => parseOps([raw], TODAY)

  it.each<[string, unknown]>([
    ['set_budget', { op: 'set_budget', value: 900000 }],
    ['adjust_budget_pct', { op: 'adjust_budget_pct', value: -10 }],
    ['set_guests', { op: 'set_guests', value: 120 }],
    ['shift_event_days', { op: 'shift_event_days', value: 7 }],
    ['set_event_date', { op: 'set_event_date', value: '2027-03-01' }],
    ['set_city', { op: 'set_city', value: 'metro' }],
    ['set_priority', { op: 'set_priority', category: 'photo', level: 'splurge' }],
    ['add_function', { op: 'add_function', value: 'haldi' }],
    ['remove_function', { op: 'remove_function', value: 'sangeet' }],
    ['mark_task_done', { op: 'mark_task_done', taskId: 'venue' }],
    ['delay_task', { op: 'delay_task', taskId: 'venue', notBefore: '2026-12-01' }],
  ])('accepts %s', (_name, raw) => {
    const { ops, rejected } = ok(raw)
    expect(rejected).toEqual([])
    expect(ops).toHaveLength(1)
  })

  it.each<[string, unknown]>([
    ['budget too small', { op: 'set_budget', value: 10 }],
    ['budget as text', { op: 'set_budget', value: '8 lakh' }],
    ['budget cut of 100%', { op: 'adjust_budget_pct', value: -100 }],
    ['guests too many', { op: 'set_guests', value: 99999 }],
    ['fractional day shift', { op: 'shift_event_days', value: 1.5 }],
    ['absurd day shift', { op: 'shift_event_days', value: 5000 }],
    ['past date', { op: 'set_event_date', value: '2026-01-01' }],
    ['unknown city', { op: 'set_city', value: 'mars' }],
    ['unknown category', { op: 'set_priority', category: 'fireworks', level: 'save' }],
    ['unknown level', { op: 'set_priority', category: 'photo', level: 'extreme' }],
    ['unknown function', { op: 'add_function', value: 'baraat' }],
    ['unknown task', { op: 'delay_task', taskId: 'nope', notBefore: '2026-12-01' }],
    ['bad delay date', { op: 'delay_task', taskId: 'venue', notBefore: 'later' }],
    ['not an object', 'set_budget'],
    ['missing op name', { value: 1 }],
  ])('rejects %s', (_name, raw) => {
    const { ops, rejected } = ok(raw)
    expect(ops).toEqual([])
    expect(rejected).toHaveLength(1)
  })
})

describe('describeOp and applyOp', () => {
  const ops: Op[] = [
    { op: 'set_budget', value: 900000 },
    { op: 'adjust_budget_pct', value: 10 },
    { op: 'set_guests', value: 120 },
    { op: 'set_event_date', value: '2027-03-01' },
    { op: 'shift_event_days', value: 7 },
    { op: 'shift_event_days', value: -7 },
    { op: 'set_city', value: 'metro' },
    { op: 'set_priority', category: 'photo', level: 'splurge' },
    { op: 'add_function', value: 'haldi' },
    { op: 'remove_function', value: 'sangeet' },
    { op: 'mark_task_done', taskId: 'venue' },
    { op: 'delay_task', taskId: 'venue', notBefore: '2026-12-01' },
  ]

  it('describes every operation with something readable', () => {
    for (const op of ops) expect(describeOp(op, plan()).length).toBeGreaterThan(5)
  })

  it('applies every operation without mutating the original plan', () => {
    const before = JSON.stringify(plan())
    const s = plan()
    const after = applyOps(s, ops, TODAY)
    expect(JSON.stringify(s)).toBe(before)
    expect(after.profile.city).toBe('metro')
    expect(after.profile.priorities.photo).toBe('splurge')
    expect(after.profile.functions).toContain('haldi')
    expect(after.profile.functions).not.toContain('sangeet')
    expect(after.tasks.venue).toMatchObject({ status: 'todo', notBefore: '2026-12-01' })
  })

  it('marking a task done records today; delaying one reopens it', () => {
    const done = applyOp(plan(), { op: 'mark_task_done', taskId: 'venue' }, TODAY)
    expect(done.tasks.venue).toEqual({ status: 'done', doneOn: TODAY })
    const reopened = applyOp(done, { op: 'delay_task', taskId: 'venue', notBefore: addDays(TODAY, 30) }, TODAY)
    expect(reopened.tasks.venue.status).toBe('todo')
  })

  it('adding a function that already exists changes nothing', () => {
    const s = plan()
    expect(applyOp(s, { op: 'add_function', value: 'wedding' }, TODAY)).toBe(s)
  })
})

describe('withTimeout', () => {
  it('resolves, rejects and times out', async () => {
    await expect(withTimeout(Promise.resolve(1), 50, 'slow')).resolves.toBe(1)
    await expect(withTimeout(Promise.reject(new Error('boom')), 50, 'slow')).rejects.toThrow('boom')
    await expect(withTimeout(new Promise(() => {}), 10, 'slow')).rejects.toThrow('slow')
  })
})

describe('fetchIdeas retry', () => {
  const good = JSON.stringify({ ideas: [{ title: 'Marigold canopy', estCost: 40000 }] })
  const provider = (replies: string[]) => {
    let i = 0
    return { name: 'test', generate: async () => replies[Math.min(i++, replies.length - 1)] }
  }

  it('tries once more when the first reply has no usable ideas', async () => {
    const { fetchIdeas } = await import('../lib/aiTasks')
    const ideas = await fetchIdeas(provider(['{"ideas":[]}', good]), plan(), 'decor', 100000)
    expect(ideas).toHaveLength(1)
  })

  it('retries unparsable JSON once, then gives up with an empty list', async () => {
    const { fetchIdeas } = await import('../lib/aiTasks')
    expect(await fetchIdeas(provider(['not json', good]), plan(), 'decor', 100000)).toHaveLength(1)
    expect(await fetchIdeas(provider(['{"ideas":[]}']), plan(), 'decor', 100000)).toEqual([])
  })

  it('does not retry a network failure', async () => {
    const { fetchIdeas } = await import('../lib/aiTasks')
    let calls = 0
    const failing = {
      name: 'test',
      generate: async () => {
        calls++
        throw new Error('503')
      },
    }
    await expect(fetchIdeas(failing, plan(), 'decor', 100000)).rejects.toThrow('503')
    expect(calls).toBe(1)
  })
})

describe('edits (pure plan changes)', () => {
  it('only one quote per category can be booked', async () => {
    const edits = await import('../lib/edits')
    const quote = (id: string, category: 'catering' | 'venue', status: 'received' | 'booked') =>
      ({ id, category, status }) as unknown as import('../types').Quote
    const s = {
      ...plan(),
      quotes: [quote('a', 'catering', 'booked'), quote('b', 'catering', 'received'), quote('c', 'venue', 'booked')],
    }
    const next = edits.setQuoteStatus(s, 'b', 'booked')
    expect(next.quotes.map((q) => q.status)).toEqual(['shortlisted', 'booked', 'booked'])
    expect(edits.setQuoteStatus(s, 'missing', 'booked')).toBe(s)
  })

  it('own figures set and clear; tasks toggle; delays clear', async () => {
    const edits = await import('../lib/edits')
    const withOwn = edits.setOwnFigure(plan(), 'photo', 90000)
    expect(withOwn.own.photo).toBe(90000)
    expect(edits.setOwnFigure(withOwn, 'photo', null).own.photo).toBeUndefined()
    const done = edits.toggleTask(plan(), 'venue', TODAY)
    expect(done.tasks.venue).toEqual({ status: 'done', doneOn: TODAY })
    expect(edits.toggleTask(done, 'venue', TODAY).tasks.venue).toEqual({ status: 'todo' })
    const delayed = edits.delayTask(plan(), 'venue', '2026-12-01')
    expect(delayed.tasks.venue.notBefore).toBe('2026-12-01')
    expect(edits.delayTask(delayed, 'venue', null).tasks.venue).toEqual({ status: 'todo' })
  })

  it('priorities, checklist, scope and quote removal', async () => {
    const edits = await import('../lib/edits')
    expect(edits.setPriority(plan(), 'photo', 'splurge').profile.priorities.photo).toBe('splurge')
    expect(edits.toggleChecklist(edits.toggleChecklist(plan(), 'k'), 'k').checklist.k).toBe(false)
    const q = { id: 'a', category: 'catering', status: 'received' } as unknown as import('../types').Quote
    const s = edits.addQuote(plan(), q)
    expect(edits.setQuoteScope(s, 'a', 'one').quotes[0].scope).toBe('one')
    expect(edits.removeQuote(s, 'a').quotes).toEqual([])
  })
})

describe('storage', () => {
  it('round-trips a plan and treats corrupt data as no plan', async () => {
    const { loadPlan, savePlan } = await import('../lib/storage')
    localStorage.clear()
    expect(loadPlan()).toBeNull()
    savePlan(plan())
    expect(loadPlan()?.profile.guests).toBe(200)
    localStorage.setItem('shaadi-compass.plan.v1', '{broken')
    expect(loadPlan()).toBeNull()
    savePlan(null)
    expect(localStorage.getItem('shaadi-compass.plan.v1')).toBeNull()
  })
})

describe('parseOps edge cases', () => {
  it('rejects operation names that only exist on Object.prototype', () => {
    const { ops, rejected } = parseOps([{ op: 'constructor' }, { op: 'toString' }, { op: '__proto__' }], TODAY)
    expect(ops).toEqual([])
    expect(rejected).toHaveLength(3)
    expect(rejected[0]).toMatch(/not an operation/)
  })
})
