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
