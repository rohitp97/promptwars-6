import { useState } from 'react'
import { addDays, formatDate, parseIso } from '../lib/dates'
import { formatINR, parseAmount } from '../lib/money'
import { LIMITS } from '../lib/ops'
import type { PlanApi } from '../hooks/usePlan'
import { Bar, Button, Card, Field, inputCls } from './ui'

export function Overview({ api }: { api: PlanApi }) {
  const { plan, derived, today } = api
  const [budgetText, setBudgetText] = useState('')
  const [guestsText, setGuestsText] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  if (!plan || !derived) return null
  const { budget, timeline, tasks } = derived
  const over = budget.gap > 0
  const recoverable = tasks.filter((t) => t.status !== 'done' && (t.health === 'at_risk' || t.health === 'overdue'))

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const patch: Partial<typeof plan.profile> = {}
    if (budgetText.trim()) {
      const v = parseAmount(budgetText)
      if (v === null || v < LIMITS.minBudget || v > LIMITS.maxBudget) return setError('Budget not understood.')
      patch.budget = v
    }
    if (guestsText.trim()) {
      const v = Number(guestsText)
      if (!Number.isInteger(v) || v < LIMITS.minGuests || v > LIMITS.maxGuests) return setError('Guests not valid.')
      patch.guests = v
    }
    if (date) {
      if (!parseIso(date) || date <= today) return setError('Pick a future date.')
      patch.eventDate = date
    }
    setError(null)
    if (Object.keys(patch).length === 0) return
    api.editProfile(patch)
    setBudgetText('')
    setGuestsText('')
    setDate('')
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Budget">
          <p className="text-3xl font-semibold text-ink">{formatINR(budget.planned)}</p>
          <p className="text-sm text-muted">
            planned, including a {formatINR(budget.contingency)} reserve, of {formatINR(budget.budget)}
          </p>
          <div className="my-2">
            <Bar value={budget.planned} max={budget.budget} over={over} />
          </div>
          <p className={`text-sm font-semibold ${over ? 'text-danger' : 'text-quote'}`}>
            {over ? `${formatINR(budget.gap)} over budget` : `${formatINR(-budget.gap)} under budget`}
          </p>
          <p className="mt-1 text-xs text-muted">
            {Math.round(budget.confidence * 100)}% of this is backed by a quote or your own figure. The rest is
            estimate.
          </p>
        </Card>

        <Card title="Timeline">
          <p className="text-3xl font-semibold text-ink">{timeline.daysToEvent} days</p>
          <p className="text-sm text-muted">to {formatDate(plan.profile.eventDate)}</p>
          <p className="mt-2 text-sm">
            {timeline.done} of {timeline.total} tasks done
          </p>
          <p
            className={`text-sm font-semibold ${recoverable.length > 0 ? 'text-danger' : timeline.tight > 0 ? 'text-estimate' : 'text-quote'}`}
          >
            {recoverable.length > 0
              ? `${recoverable.length} task${recoverable.length === 1 ? '' : 's'} cannot fit as planned`
              : timeline.tight > 0
                ? `${timeline.tight} tight`
                : 'On track'}
          </p>
        </Card>

        <Card title="Do this next">
          {timeline.next ? (
            <>
              <p className="font-semibold">{timeline.next.title}</p>
              <p className="mt-1 text-sm text-muted">{timeline.next.why}</p>
              <p className="mt-2 text-sm">
                Due {formatDate(timeline.next.due)}
                {timeline.next.slack < 0 && (
                  <span className="font-semibold text-danger"> · needs to be {-timeline.next.slack} days faster</span>
                )}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Everything is done. Enjoy the wedding.</p>
          )}
        </Card>
      </div>

      <details className="rounded-xl border border-line bg-card p-4 shadow-sm sm:p-5">
        <summary className="cursor-pointer font-serif text-lg font-semibold text-ink">Edit the basics</summary>
        <div className="mt-3">
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-4 sm:items-end">
            <Field label="Budget" hint={`Now ${formatINR(plan.profile.budget)}`}>
              <input
                className={inputCls}
                value={budgetText}
                placeholder="e.g. 6.5 lakh"
                onChange={(e) => setBudgetText(e.target.value)}
              />
            </Field>
            <Field label="Guests" hint={`Now ${plan.profile.guests}`}>
              <input
                className={inputCls}
                value={guestsText}
                inputMode="numeric"
                onChange={(e) => setGuestsText(e.target.value)}
              />
            </Field>
            <Field label="Date" hint={`Now ${formatDate(plan.profile.eventDate)}`}>
              <input
                type="date"
                className={inputCls}
                value={date}
                min={addDays(today, 1)}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Button type="submit">Update plan</Button>
          </form>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </details>
    </div>
  )
}
