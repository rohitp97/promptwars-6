import { useState } from 'react'
import { BENCHMARKS_REVIEWED_ON, CATEGORIES } from '../data/benchmarks'
import { formatINR, parseAmount } from '../lib/money'
import type { PlanApi } from '../hooks/usePlan'
import type { CategoryId, Priority } from '../types'
import { Bar, Button, Card, ProvenanceBadge, inputCls } from './ui'

function OwnFigure({
  id,
  current,
  onSet,
}: {
  id: CategoryId
  current: number | undefined
  onSet: (v: number | null) => void
}) {
  const [text, setText] = useState('')
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const v = parseAmount(text)
        if (v !== null && v > 0) {
          onSet(v)
          setText('')
        }
      }}
    >
      <label className="sr-only" htmlFor={`own-${id}`}>
        Your own figure for {id}
      </label>
      <input
        id={`own-${id}`}
        className={`${inputCls} max-w-[9rem]`}
        placeholder="Your figure"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <Button type="submit" variant="secondary" disabled={!text.trim()}>
        Set
      </Button>
      {current !== undefined && (
        <Button variant="ghost" onClick={() => onSet(null)}>
          Use estimate
        </Button>
      )}
    </form>
  )
}

export function BudgetView({ api }: { api: PlanApi }) {
  const { plan, derived } = api
  if (!plan || !derived) return null
  const { budget, tradeoffs } = derived
  const over = budget.gap > 0

  return (
    <div className="space-y-4">
      {over && (
        <Card title={`You are ${formatINR(budget.gap)} over. Here is what would close the gap.`}>
          <p className="mb-3 text-sm text-muted">
            Each option is applied to a copy of your plan and the budget is recomputed, so the saving shown is exactly
            what you would see. Options overlap: apply one, then the list updates.
          </p>
          <ul className="space-y-2">
            {tradeoffs.slice(0, 6).map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-sm text-muted">{t.detail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-quote">saves {formatINR(t.saving)}</span>
                  <Button variant="secondary" onClick={() => api.applyTradeoff(t)}>
                    Apply
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Where the money goes">
        <ul className="divide-y divide-line">
          {CATEGORIES.map((c) => {
            const line = budget.lines.find((l) => l.id === c.id)
            if (!line) return null
            const overLine = line.effective.value > line.allocation * 1.05
            return (
              <li key={c.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{c.label}</h3>
                    <p className="text-sm text-muted">
                      Plan allows {formatINR(line.allocation)} · typical {formatINR(line.low)} to {formatINR(line.high)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-semibold ${overLine ? 'text-danger' : 'text-ink'}`}>
                      {formatINR(line.effective.value)}
                    </p>
                    <ProvenanceBadge kind={line.effective.provenance} />
                  </div>
                </div>
                <div className="my-2">
                  <Bar value={line.effective.value} max={line.allocation} over={overLine} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-muted">Priority</span>
                    <select
                      className={`${inputCls} w-auto`}
                      value={plan.profile.priorities[c.id]}
                      onChange={(e) => api.setPriority(c.id, e.target.value as Priority)}
                      aria-label={`Priority for ${c.label}`}
                    >
                      <option value="save">Keep lean</option>
                      <option value="normal">Standard</option>
                      <option value="splurge">Splurge</option>
                    </select>
                  </label>
                  <OwnFigure id={c.id} current={plan.own[c.id]} onSet={(v) => api.setOwn(c.id, v)} />
                </div>
              </li>
            )
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">
          Includes a {formatINR(budget.contingency)} reserve (10%) for overruns, which are normal for weddings. Typical
          costs are the app author's estimates for your city type, guest count and functions (last reviewed{' '}
          {BENCHMARKS_REVIEWED_ON}); they are not vendor prices. Booking a quote in the Vendors tab replaces the
          estimate.
        </p>
      </Card>
    </div>
  )
}
