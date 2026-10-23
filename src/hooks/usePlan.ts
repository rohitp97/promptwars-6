import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategoryId, Op, PlanState, Priority, Profile, Quote, QuoteStatus, Tradeoff } from '../types'
import { todayIso } from '../lib/dates'
import { applyOps } from '../lib/ops'
import { STORAGE_KEY, diffSnapshots, logEntry, parseSavedPlan, snapshot } from '../lib/plan'
import { summarizeBudget } from '../lib/budget'
import { buildTradeoffs } from '../lib/tradeoffs'
import { scheduleTasks, summarizeTimeline } from '../lib/timeline'

function load(): PlanState | null {
  try {
    return parseSavedPlan(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}

function save(plan: PlanState | null): void {
  try {
    if (plan) localStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private window, quota). The plan still works for this visit.
  }
}

export interface ChangeOutcome {
  lines: string[]
}

/**
 * Single owner of the plan. Every edit goes through `commit`, which keeps one level of undo and
 * writes a before/after summary to the change log. Plan data stays in this browser (localStorage);
 * nothing is stored on a server.
 */
export function usePlan() {
  const [plan, setPlan] = useState<PlanState | null>(load)
  const [previous, setPrevious] = useState<PlanState | null>(null)
  const [outcome, setOutcome] = useState<ChangeOutcome | null>(null)
  const today = useMemo(() => todayIso(), [])

  useEffect(() => save(plan), [plan])

  const commit = useCallback(
    (update: (s: PlanState) => PlanState, label: string | ((before: PlanState) => string)) => {
      setPlan((current) => {
        if (!current) return current
        const next = update(current)
        if (next === current) return current
        const text = typeof label === 'function' ? label(current) : label
        const lines = diffSnapshots(snapshot(current, today), snapshot(next, today))
        setPrevious(current)
        setOutcome({ lines })
        return {
          ...next,
          log: [...next.log, logEntry(lines.length > 0 ? `${text}: ${lines.join('; ')}` : text)].slice(-50),
        }
      })
    },
    [today],
  )

  const start = useCallback((initial: PlanState) => {
    setPlan(initial)
    setPrevious(null)
    setOutcome(null)
  }, [])

  const reset = useCallback(() => {
    setPlan(null)
    setPrevious(null)
    setOutcome(null)
  }, [])

  const undo = useCallback(() => {
    if (!previous) return
    setPlan(previous)
    setPrevious(null)
    setOutcome(null)
  }, [previous])

  const apply = useCallback(
    (ops: Op[], label = 'Change') => {
      commit((s) => applyOps(s, ops, today), label)
    },
    [commit, today],
  )

  const editProfile = useCallback(
    (patch: Partial<Profile>) => commit((s) => ({ ...s, profile: { ...s.profile, ...patch } }), 'Edited plan'),
    [commit],
  )

  const setPriority = useCallback(
    (category: CategoryId, level: Priority) =>
      commit(
        (s) => ({ ...s, profile: { ...s.profile, priorities: { ...s.profile.priorities, [category]: level } } }),
        'Priority',
      ),
    [commit],
  )

  const applyTradeoff = useCallback(
    (t: Tradeoff) => commit((s) => ({ ...s, profile: { ...s.profile, ...t.patch } }), t.title),
    [commit],
  )

  const setOwn = useCallback(
    (category: CategoryId, value: number | null) =>
      commit((s) => {
        const own = { ...s.own }
        if (value === null) delete own[category]
        else own[category] = value
        return { ...s, own }
      }, 'Your own figure'),
    [commit],
  )

  const toggleTask = useCallback(
    (taskId: string) =>
      commit((s) => {
        const done = s.tasks[taskId]?.status === 'done'
        return { ...s, tasks: { ...s.tasks, [taskId]: done ? { status: 'todo' } : { status: 'done', doneOn: today } } }
      }, 'Task'),
    [commit, today],
  )

  const delayTask = useCallback(
    (taskId: string, notBefore: string | null) =>
      commit(
        (s) => ({ ...s, tasks: { ...s.tasks, [taskId]: { status: 'todo', ...(notBefore ? { notBefore } : {}) } } }),
        'Task delayed',
      ),
    [commit],
  )

  const addQuote = useCallback(
    (quote: Quote) => commit((s) => ({ ...s, quotes: [...s.quotes, quote] }), 'Quote added'),
    [commit],
  )

  const setQuoteStatus = useCallback(
    (id: string, status: QuoteStatus) =>
      commit(
        (s) => ({
          ...s,
          quotes: s.quotes.map((q) => {
            if (q.id === id) return { ...q, status }
            const sameCategoryBooked = status === 'booked' && q.category === s.quotes.find((x) => x.id === id)?.category
            return sameCategoryBooked && q.status === 'booked' ? { ...q, status: 'shortlisted' as const } : q
          }),
        }),
        'Quote status',
      ),
    [commit],
  )

  const setQuoteScope = useCallback(
    (id: string, scope: 'all' | 'one') =>
      commit((s) => ({ ...s, quotes: s.quotes.map((q) => (q.id === id ? { ...q, scope } : q)) }), 'Quote scope'),
    [commit],
  )

  const removeQuote = useCallback(
    (id: string) => commit((s) => ({ ...s, quotes: s.quotes.filter((q) => q.id !== id) }), 'Quote removed'),
    [commit],
  )

  const toggleChecklist = useCallback((key: string) => {
    setPlan((s) => (s ? { ...s, checklist: { ...s.checklist, [key]: !s.checklist[key] } } : s))
  }, [])

  const derived = useMemo(() => {
    if (!plan) return null
    const budget = summarizeBudget(plan)
    const tasks = scheduleTasks(plan, today)
    return {
      budget,
      tasks,
      timeline: summarizeTimeline(tasks, plan.profile.eventDate, today),
      tradeoffs: budget.gap > 0 ? buildTradeoffs(plan) : [],
    }
  }, [plan, today])

  return {
    plan,
    today,
    derived,
    outcome,
    canUndo: previous !== null,
    dismissOutcome: () => setOutcome(null),
    start,
    reset,
    undo,
    apply,
    editProfile,
    setPriority,
    applyTradeoff,
    setOwn,
    toggleTask,
    delayTask,
    addQuote,
    setQuoteStatus,
    setQuoteScope,
    removeQuote,
    toggleChecklist,
  }
}

export type PlanApi = ReturnType<typeof usePlan>
