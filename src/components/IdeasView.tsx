import { useState } from 'react'
import { fetchIdeas, ideaFit } from '../lib/aiTasks'
import { formatINR } from '../lib/money'
import type { PlanApi } from '../hooks/usePlan'
import type { AiProvider, CategoryId, Idea, IdeaFit } from '../types'
import { Button, CategoryPicker, Card } from './ui'

const FIT: Record<IdeaFit, { label: string; cls: string }> = {
  fits: { label: 'Fits your plan', cls: 'bg-quoteSoft text-quote' },
  stretch: { label: 'A stretch', cls: 'bg-estimateSoft text-estimate' },
  over: { label: 'Over your plan', cls: 'bg-dangerSoft text-danger' },
}

export function IdeasView({ api, ai }: { api: PlanApi; ai: AiProvider | null }) {
  const { plan, derived } = api
  const [category, setCategory] = useState<CategoryId>('decor')
  const [ideas, setIdeas] = useState<Record<string, Idea[]>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!plan || !derived) return null

  const line = derived.budget.lines.find((l) => l.id === category)
  const cap = line?.allocation ?? 0
  const current = ideas[category] ?? []

  const generate = async (cheaperThan?: string) => {
    if (!ai) return
    setBusy(true)
    setError(null)
    try {
      const result = await fetchIdeas(ai, plan, category, cap, cheaperThan)
      if (result.length === 0) setError('No usable ideas came back. Try again.')
      else setIdeas((prev) => ({ ...prev, [category]: result }))
    } catch {
      setError('Ideas are unavailable right now. Try again in a moment.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Ideas that fit your family and your number">
      <p className="mb-3 text-sm text-muted">
        Ideas use what you wrote about the feel of the wedding and the budget this category allows ({formatINR(cap)}).
        The cost on each idea is the AI's rough estimate, not a quote. Whether it fits is decided by code against your
        plan.
      </p>
      <CategoryPicker label="Idea category" value={category} onChange={setCategory} />
      <div className="flex items-center gap-3">
        <Button onClick={() => void generate()} disabled={busy || !ai}>
          {busy ? 'Thinking…' : current.length > 0 ? 'New ideas' : 'Suggest ideas'}
        </Button>
        {!ai && <span className="text-xs text-muted">Needs the AI, which is not configured here.</span>}
      </div>
      {error && (
        <p role="alert" className="mt-2 rounded bg-dangerSoft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      <ul className="mt-4 grid gap-3 md:grid-cols-3">
        {current.map((idea) => {
          const fit = FIT[ideaFit(idea.estCost, cap)]
          return (
            <li key={idea.title} className="flex flex-col rounded-lg border border-line p-3">
              <p className="font-semibold">{idea.title}</p>
              <p className="mt-1 text-sm">{idea.description}</p>
              <p className="mt-2 text-sm">
                <b>About {formatINR(idea.estCost)}</b> <span className="text-muted">(AI estimate)</span>
              </p>
              <span className={`mt-1 w-fit rounded-full px-2 py-0.5 text-xs font-semibold ${fit.cls}`}>
                {fit.label}
              </span>
              {idea.why && <p className="mt-2 text-sm text-muted">Why: {idea.why}</p>}
              {idea.tradeoff && <p className="text-sm text-muted">Trade-off: {idea.tradeoff}</p>}
              <div className="mt-auto pt-3">
                <Button variant="secondary" disabled={busy} onClick={() => void generate(idea.title)}>
                  Too expensive: show cheaper
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
