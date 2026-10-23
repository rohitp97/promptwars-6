import { useState } from 'react'
import { type ChangeResult, interpretChange } from '../lib/aiTasks'
import { describeOp, applyOps } from '../lib/ops'
import { diffSnapshots, snapshot } from '../lib/plan'
import type { PlanApi } from '../hooks/usePlan'
import type { AiProvider, PlanState } from '../types'
import { Button, Card, inputCls } from './ui'

const EXAMPLES = [
  'Our budget is cut by 20% and the wedding is 2 weeks earlier',
  'We now expect 150 guests',
  'Skip the sangeet, put more into photography',
]

interface Props {
  plan: PlanState
  today: string
  api: PlanApi
  ai: AiProvider | null
}

export function ChangeBar({ plan, today, api, ai }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ChangeResult | null>(null)

  const preview =
    result && result.ops.length > 0
      ? diffSnapshots(snapshot(plan, today), snapshot(applyOps(plan, result.ops, today), today))
      : []

  const run = async (value: string) => {
    if (!value.trim()) return
    setBusy(true)
    setResult(null)
    try {
      setResult(await interpretChange(ai, plan, value, today))
    } finally {
      setBusy(false)
    }
  }

  const apply = () => {
    if (!result) return
    api.apply(result.ops, `You said "${text.trim().slice(0, 80)}"`)
    setResult(null)
    setText('')
  }

  return (
    <Card title="Something changed?">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void run(text)
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label className="sr-only" htmlFor="change-input">
          Describe what changed in your plan
        </label>
        <input
          id="change-input"
          className={`${inputCls} flex-1`}
          placeholder="e.g. budget cut by 20% and the wedding is 2 weeks earlier"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Reading…' : 'Preview the change'}
        </Button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setText(ex)
              void run(ex)
            }}
            className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:bg-brandSoft"
          >
            {ex}
          </button>
        ))}
      </div>
      {!ai && (
        <p className="mt-2 text-xs text-muted">
          The AI is not configured, so only simple changes (budget, guests, moving the date) are understood. You can
          also edit any number directly below.
        </p>
      )}

      <div aria-live="polite">
        {result && (
          <div className="mt-4 rounded-lg border border-line bg-paper p-3 text-sm">
            {result.ops.length > 0 ? (
              <>
                <p className="font-semibold">
                  I understood {result.ops.length} change{result.ops.length === 1 ? '' : 's'}
                  <span className="ml-2 text-xs font-normal text-muted">
                    ({result.source === 'ai' ? 'read by AI, checked by code' : 'read by built-in rules'})
                  </span>
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {result.ops.map((op, i) => (
                    <li key={i}>{describeOp(op, plan)}</li>
                  ))}
                </ul>
                {preview.length > 0 && (
                  <>
                    <p className="mt-3 font-semibold">What would happen to the plan</p>
                    <ul className="mt-1 list-disc pl-5">
                      {preview.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </>
                )}
                <div className="mt-3 flex gap-2">
                  <Button onClick={apply}>Apply to my plan</Button>
                  <Button variant="secondary" onClick={() => setResult(null)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <p>
                {result.clarify ??
                  "I couldn't find a change I can make from that. Try a budget, a guest count, a date, or a function."}
              </p>
            )}
            {result.ops.length > 0 && result.clarify && <p className="mt-2 text-muted">Also: {result.clarify}</p>}
            {result.rejected.length > 0 && (
              <p className="mt-2 text-xs text-danger">Ignored: {result.rejected.join('; ')}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
