import { useMemo, useState } from 'react'
import { BudgetView } from './components/BudgetView'
import { ChangeBar } from './components/ChangeBar'
import { IdeasView } from './components/IdeasView'
import { Overview } from './components/Overview'
import { Setup } from './components/Setup'
import { TimelineView } from './components/TimelineView'
import { VendorsView } from './components/VendorsView'
import { Button, Card } from './components/ui'
import { usePlan } from './hooks/usePlan'
import { createAiProvider } from './lib/ai'

const TABS = [
  { id: 'budget', label: 'Budget' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'vendors', label: 'Vendors' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'log', label: 'What changed' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function App() {
  const api = usePlan()
  const ai = useMemo(() => createAiProvider(), [])
  const [tab, setTab] = useState<TabId>('budget')
  const { plan } = api

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="font-serif text-xl font-semibold text-brand">Shaadi Compass</span>
          </div>
          {plan && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={api.undo} disabled={!api.canUndo}>
                Undo last change
              </Button>
              <Button variant="secondary" onClick={() => window.print()}>
                Print plan
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  if (window.confirm('Start over? This clears the plan saved in this browser.')) api.reset()
                }}
              >
                Start over
              </Button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        {!plan ? (
          <Setup today={api.today} onStart={api.start} />
        ) : (
          <>
            <div className="no-print">
              <ChangeBar plan={plan} today={api.today} api={api} ai={ai} />
            </div>

            <div aria-live="polite" className="no-print">
              {api.outcome && api.outcome.lines.length > 0 && (
                <div className="rounded-xl border border-brand/30 bg-brandSoft p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-brand">Plan updated. Here is what moved:</p>
                      <ul className="mt-1 list-disc pl-5 text-sm">
                        {api.outcome.lines.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <Button variant="secondary" onClick={api.undo}>
                        Undo
                      </Button>
                      <Button variant="ghost" onClick={api.dismissOutcome}>
                        Dismiss
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Overview api={api} />

            <div className="no-print" role="tablist" aria-label="Plan sections">
              <div className="flex flex-wrap gap-1 border-b border-line">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    id={`tab-${t.id}`}
                    aria-selected={tab === t.id}
                    aria-controls={`panel-${t.id}`}
                    onClick={() => setTab(t.id)}
                    className={`-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-semibold ${tab === t.id ? 'border-line bg-card text-brand' : 'border-transparent text-muted hover:text-brand'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === 'budget' && <BudgetView api={api} />}
              {tab === 'timeline' && <TimelineView api={api} />}
              {tab === 'vendors' && <VendorsView api={api} ai={ai} />}
              {tab === 'ideas' && <IdeasView api={api} ai={ai} />}
              {tab === 'log' && (
                <Card title="What changed">
                  {plan.log.length === 0 ? (
                    <p className="text-sm text-muted">Nothing yet. Every change you make is recorded here.</p>
                  ) : (
                    <ol className="space-y-2 text-sm">
                      {[...plan.log].reverse().map((e) => (
                        <li key={e.at} className="border-b border-line pb-2">
                          <span className="text-xs text-muted">{new Date(e.at).toLocaleString()}</span>
                          <br />
                          {e.text}
                        </li>
                      ))}
                    </ol>
                  )}
                </Card>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="no-print mx-auto max-w-5xl px-4 pb-8 text-xs text-muted">
        <p>
          Your plan is saved only in this browser. Costs are estimates for planning, not vendor prices, and nothing here
          confirms a vendor's availability. Always get written quotes. AI reads your words and quotes; code does the
          arithmetic and checks.
        </p>
      </footer>
    </div>
  )
}
