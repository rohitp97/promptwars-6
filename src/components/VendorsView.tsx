import { useState } from 'react'
import { CATEGORIES, VENDOR_CHECKLIST } from '../data/benchmarks'
import { QuoteReadError, extractQuote } from '../lib/aiTasks'
import { formatINR } from '../lib/money'
import { compareQuote, quoteUnits } from '../lib/quotes'
import type { PlanApi } from '../hooks/usePlan'
import type { AiProvider, CategoryId, Quote, QuoteStatus } from '../types'
import { Button, CategoryPicker, Card, ProvenanceBadge, inputCls } from './ui'

const BASIS_LABEL = { per_plate: 'per plate', per_person: 'per person', flat: 'flat', per_day: 'per day' } as const
const STATUS_LABEL: Record<QuoteStatus, string> = {
  received: 'Received',
  shortlisted: 'Shortlisted',
  booked: 'Booked',
  rejected: 'Rejected',
}

function QuoteCard({ quote, api }: { quote: Quote; api: PlanApi }) {
  const { plan, derived } = api
  if (!plan || !derived) return null
  const line = derived.budget.lines.find((l) => l.id === quote.category)
  if (!line) return null
  const d = quote.data
  const units = quoteUnits(quote, d, plan.profile.functions)
  const cmp = compareQuote(d, quote.category, plan.profile.guests, line.allocation, line.low, units)
  const perPlateCatering = d.basis === 'per_plate' && quote.category === 'catering'
  return (
    <li className="rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{d.vendor}</p>
          <p className="text-sm text-muted">
            {formatINR(d.amount)} {BASIS_LABEL[d.basis]}
            {cmp.total.scaledTo
              ? ` × ${cmp.total.scaledTo} guests${perPlateCatering && units !== 1 ? ` × ${units} meals` : ''} = ${formatINR(cmp.total.base)}`
              : ''}
          </p>
          <p className="text-sm">
            {d.gstIncluded === true ? (
              <span>GST included: {formatINR(cmp.total.base)}</span>
            ) : (
              <span>
                With GST <b>{formatINR(cmp.total.low)}</b> to <b>{formatINR(cmp.total.high)}</b>{' '}
                <span className="text-muted">
                  ({d.gstIncluded === false ? 'GST is extra, rate not stated' : 'quote does not say'}; assumed 5-18%)
                </span>
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ProvenanceBadge kind="quote" />
          <label className="text-sm">
            <span className="sr-only">Status of quote from {d.vendor}</span>
            <select
              className={`${inputCls} w-auto`}
              value={quote.status}
              onChange={(e) => api.setQuoteStatus(quote.id, e.target.value as QuoteStatus)}
            >
              {Object.entries(STATUS_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {perPlateCatering && (
        <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">This rate covers</span>
          <select
            className={`${inputCls} w-auto`}
            value={quote.scope ?? 'all'}
            onChange={(e) => api.setQuoteScope(quote.id, e.target.value as 'all' | 'one')}
          >
            <option value="all">every meal across my functions</option>
            <option value="one">one meal only</option>
          </select>
        </label>
      )}

      <p
        className={`mt-2 rounded px-2 py-1 text-sm font-semibold ${cmp.verdict === 'over' ? 'bg-dangerSoft text-danger' : cmp.verdict === 'suspiciously_low' ? 'bg-estimateSoft text-estimate' : 'bg-quoteSoft text-quote'}`}
      >
        {cmp.verdict === 'over' &&
          `Over what your plan allows here (${formatINR(line.allocation)}) by at least ${formatINR(cmp.total.low - line.allocation)}`}
        {cmp.verdict === 'within' && `Within what your plan allows here (${formatINR(line.allocation)})`}
        {cmp.verdict === 'suspiciously_low' &&
          `Well below the typical ${formatINR(line.low)} to ${formatINR(line.high)}. Check what is left out.`}
      </p>

      {(d.inclusions.length > 0 || d.exclusions.length > 0 || d.extraCharges.length > 0) && (
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="font-semibold">Included</dt>
            <dd className="text-muted">{d.inclusions.join(', ') || 'Not stated'}</dd>
          </div>
          <div>
            <dt className="font-semibold">Not included</dt>
            <dd className="text-muted">{d.exclusions.join(', ') || 'Not stated'}</dd>
          </div>
          <div>
            <dt className="font-semibold">Extra charges</dt>
            <dd className="text-muted">
              {d.extraCharges.map((c) => `${c.label}${c.amount ? ` ${formatINR(c.amount)}` : ''}`).join(', ') ||
                'Not stated'}
            </dd>
          </div>
        </dl>
      )}

      {cmp.gaps.length > 0 && (
        <div className="mt-2 text-sm">
          <p className="font-semibold">Ask before booking (the quote does not say)</p>
          <ul className="list-disc pl-5 text-muted">
            {cmp.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </div>
      )}
      {quote.check.removed.length > 0 && (
        <p className="mt-2 text-xs text-muted">
          Removed after checking the text you pasted: {quote.check.removed.join('; ')}. The AI listed these but they are
          not in the quote.
        </p>
      )}
      <div className="mt-2">
        <Button variant="ghost" onClick={() => api.removeQuote(quote.id)}>
          Remove quote
        </Button>
      </div>
    </li>
  )
}

export function VendorsView({ api, ai }: { api: PlanApi; ai: AiProvider | null }) {
  const { plan } = api
  const [category, setCategory] = useState<CategoryId>('catering')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!plan) return null

  const read = async () => {
    setBusy(true)
    setError(null)
    try {
      const quote = await extractQuote(ai, category, text, crypto.randomUUID())
      api.addQuote(quote)
      setText('')
    } catch (err) {
      setError(
        err instanceof QuoteReadError ? err.message : 'Could not read that quote right now. Try again in a moment.',
      )
    } finally {
      setBusy(false)
    }
  }

  const checklist = VENDOR_CHECKLIST[category]
  const forCategory = plan.quotes.filter((q) => q.category === category)

  return (
    <div className="space-y-4">
      <Card title="Compare vendor quotes">
        <p className="mb-3 text-sm text-muted">
          Paste a quote from WhatsApp, email or a PDF. The AI reads it, then code checks that the price and every
          inclusion appear in your text. Anything it cannot find is removed. Prices are never invented, and nothing here
          says a vendor is available.
        </p>
        <CategoryPicker
          label="Vendor type"
          value={category}
          onChange={setCategory}
          badge={(id) => {
            const n = plan.quotes.filter((q) => q.category === id).length
            return n > 0 ? ` (${n})` : ''
          }}
        />
        <label className="block text-sm font-semibold" htmlFor="quote-text">
          Paste the quote
        </label>
        <textarea
          id="quote-text"
          className={`${inputCls} mt-1`}
          rows={5}
          value={text}
          placeholder="e.g. Veg buffet, 3 starters, 2 live counters, Rs. 850 per plate + GST. Service staff included. Liquor not included. 50% advance. Valid till 30 Nov."
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex items-center gap-3">
          <Button onClick={() => void read()} disabled={busy || text.trim().length < 10 || !ai}>
            {busy ? 'Reading…' : 'Read this quote'}
          </Button>
          {!ai && <span className="text-xs text-muted">Needs the AI, which is not configured here.</span>}
        </div>
        {error && (
          <p role="alert" className="mt-2 rounded bg-dangerSoft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}
      </Card>

      {forCategory.length > 0 && (
        <Card title={`${CATEGORIES.find((c) => c.id === category)?.label} quotes`}>
          <ul className="space-y-3">
            {forCategory.map((q) => (
              <QuoteCard key={q.id} quote={q} api={api} />
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Mark a quote <b>Booked</b> and its price (at the top of the GST range, to be safe) replaces the estimate in
            your budget.
          </p>
        </Card>
      )}

      <Card title="Questions to ask every vendor of this type">
        <ul className="space-y-2">
          {checklist.map((q) => {
            const key = `${category}:${q}`
            return (
              <li key={key}>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-brand"
                    checked={!!plan.checklist[key]}
                    onChange={() => api.toggleChecklist(key)}
                  />
                  <span className={plan.checklist[key] ? 'text-muted line-through' : ''}>{q}</span>
                </label>
              </li>
            )
          })}
        </ul>
      </Card>
    </div>
  )
}
