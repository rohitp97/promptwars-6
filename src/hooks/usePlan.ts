import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CategoryId, Op, PlanState, Priority, Profile, Quote, QuoteStatus, Tradeoff } from '../types'
import { summarizeBudget } from '../lib/budget'
import { todayIso } from '../lib/dates'
import * as edits from '../lib/edits'
import { applyOps } from '../lib/ops'
import { diffSnapshots, logEntry, snapshot } from '../lib/plan'
import { loadPlan, savePlan } from '../lib/storage'
import { scheduleTasks, summarizeTimeline } from '../lib/timeline'
import { buildTradeoffs } from '../lib/tradeoffs'

export interface ChangeOutcome {
  lines: string[]
}

const LOG_LIMIT = 50

type Label = string | ((before: PlanState) => string)

/**
 * Single owner of the plan. Every edit goes through `commit`, which keeps one level of undo and
 * writes a before/after summary to the change log. The edit rules themselves live in `lib/edits`.
 * Plan data stays in this browser (localStorage); nothing is stored on a server.
 */
export function usePlan() {
  const [plan, setPlan] = useState<PlanState | null>(loadPlan)
  const [previous, setPrevious] = useState<PlanState | null>(null)
  const [outcome, setOutcome] = useState<ChangeOutcome | null>(null)
  const today = useMemo(() => todayIso(), [])

  useEffect(() => savePlan(plan), [plan])

  const clearHistory = () => {
    setPrevious(null)
    setOutcome(null)
  }

  const commit = useCallback(
    (update: (s: PlanState) => PlanState, label: Label) => {
      setPlan((current) => {
        if (!current) return current
        const next = update(current)
        if (next === current) return current
        const text = typeof label === 'function' ? label(current) : label
        const lines = diffSnapshots(snapshot(current, today), snapshot(next, today))
        setPrevious(current)
        setOutcome({ lines })
        const entry = logEntry(lines.length > 0 ? `${text}: ${lines.join('; ')}` : text)
        return { ...next, log: [...next.log, entry].slice(-LOG_LIMIT) }
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
    clearHistory()
  }, [previous])

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

  const actions = useMemo(
    () => ({
      apply: (ops: Op[], label = 'Change') => commit((s) => applyOps(s, ops, today), label),
      editProfile: (patch: Partial<Profile>) => commit((s) => edits.patchProfile(s, patch), 'Edited plan'),
      applyTradeoff: (t: Tradeoff) => commit((s) => edits.patchProfile(s, t.patch), t.title),
      setPriority: (category: CategoryId, level: Priority) =>
        commit((s) => edits.setPriority(s, category, level), 'Priority'),
      setOwn: (category: CategoryId, value: number | null) =>
        commit((s) => edits.setOwnFigure(s, category, value), 'Your own figure'),
      toggleTask: (taskId: string) => commit((s) => edits.toggleTask(s, taskId, today), 'Task'),
      delayTask: (taskId: string, notBefore: string | null) =>
        commit((s) => edits.delayTask(s, taskId, notBefore), 'Task delayed'),
      addQuote: (quote: Quote) => commit((s) => edits.addQuote(s, quote), 'Quote added'),
      setQuoteStatus: (id: string, status: QuoteStatus) =>
        commit((s) => edits.setQuoteStatus(s, id, status), 'Quote status'),
      setQuoteScope: (id: string, scope: 'all' | 'one') =>
        commit((s) => edits.setQuoteScope(s, id, scope), 'Quote scope'),
      removeQuote: (id: string) => commit((s) => edits.removeQuote(s, id), 'Quote removed'),
      // A checklist tick is not a plan change: no undo step, no change-log entry.
      toggleChecklist: (key: string) => setPlan((s) => (s ? edits.toggleChecklist(s, key) : s)),
    }),
    [commit, today],
  )

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
    ...actions,
  }
}

export type PlanApi = ReturnType<typeof usePlan>
