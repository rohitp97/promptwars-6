import { useState } from 'react'
import { CATEGORIES, CITY_LABEL, FUNCTIONS } from '../data/benchmarks'
import { addDays, parseIso } from '../lib/dates'
import { formatINR, parseAmount } from '../lib/money'
import { LIMITS } from '../lib/ops'
import { defaultPriorities, newPlan, samplePlan } from '../lib/plan'
import type { CategoryId, CityTier, FunctionId, PlanState, Priority } from '../types'
import { Button, Card, Field, inputCls } from './ui'

interface Props {
  today: string
  onStart: (plan: PlanState) => void
}

function Chips({
  legend,
  value,
  onToggle,
  max,
}: {
  legend: string
  value: CategoryId[]
  onToggle: (id: CategoryId) => void
  max: number
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-semibold">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const on = value.includes(c.id)
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              disabled={!on && value.length >= max}
              onClick={() => onToggle(c.id)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-40 ${on ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink hover:bg-brandSoft'}`}
            >
              {c.short}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

export function Setup({ today, onStart }: Props) {
  const [budgetText, setBudgetText] = useState('8 lakh')
  const [guests, setGuests] = useState('200')
  const [date, setDate] = useState(addDays(today, 120))
  const [city, setCity] = useState<CityTier>('tier2')
  const [functions, setFunctions] = useState<FunctionId[]>(['wedding'])
  const [splurge, setSplurge] = useState<CategoryId[]>([])
  const [save, setSave] = useState<CategoryId[]>([])
  const [vibe, setVibe] = useState('')
  const [mustHaves, setMustHaves] = useState('')
  const [error, setError] = useState<string | null>(null)

  const parsedBudget = parseAmount(budgetText)

  const toggle =
    (list: CategoryId[], set: (v: CategoryId[]) => void, other: CategoryId[], setOther: (v: CategoryId[]) => void) =>
    (id: CategoryId) => {
      set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id])
      setOther(other.filter((x) => x !== id))
    }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const guestCount = Number(guests)
    if (parsedBudget === null || parsedBudget < LIMITS.minBudget || parsedBudget > LIMITS.maxBudget) {
      return setError('Enter a budget such as "8 lakh" or "800000".')
    }
    if (!Number.isInteger(guestCount) || guestCount < LIMITS.minGuests || guestCount > LIMITS.maxGuests) {
      return setError(`Guests should be a whole number from ${LIMITS.minGuests} to ${LIMITS.maxGuests}.`)
    }
    if (!parseIso(date) || date <= today) return setError('Pick a wedding date in the future.')
    const priorities = defaultPriorities()
    for (const id of splurge) priorities[id] = 'splurge' satisfies Priority
    for (const id of save) priorities[id] = 'save' satisfies Priority
    setError(null)
    onStart(
      newPlan({
        budget: parsedBudget,
        guests: guestCount,
        eventDate: date,
        city,
        functions,
        priorities,
        vibe: vibe.trim(),
        mustHaves: mustHaves.trim(),
      }),
    )
  }

  const toggleFunction = (id: FunctionId) => {
    if (id === 'wedding') return
    setFunctions((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id]))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="pt-2">
        <h1 className="font-serif text-3xl font-semibold leading-tight text-brand sm:text-4xl">
          A wedding plan that re-plans.
        </h1>
        <p className="mt-2 text-base text-muted">
          Tell us the basics. You get a budget, a dependency-aware timeline and vendor checks. When the budget drops or
          the date moves, change the number and everything is recomputed, with a list of exactly what shifted.
        </p>
        <p className="mt-2 text-sm text-muted">
          Every rupee figure is labelled <b>Estimate</b>, <b>Quoted</b> or <b>Your figure</b>. Nothing is presented as a
          confirmed price unless a vendor wrote it.
        </p>
      </div>

      <Card title="Try it with an example">
        <p className="mb-3 text-sm text-muted">
          ₹15 lakh, 200 guests, 4 months away, food over decor, with elders and children attending.
        </p>
        <Button onClick={() => onStart(samplePlan(today))}>Load the example plan</Button>
      </Card>

      <form onSubmit={submit} noValidate>
        <Card title="Or plan your own">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Total budget"
              hint={parsedBudget ? `Read as ${formatINR(parsedBudget)}` : 'e.g. 8 lakh, 12.5L, 800000'}
            >
              <input
                className={inputCls}
                value={budgetText}
                onChange={(e) => setBudgetText(e.target.value)}
                inputMode="text"
              />
            </Field>
            <Field label="Expected guests">
              <input
                className={inputCls}
                value={guests}
                onChange={(e) => setGuests(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Wedding date">
              <input
                type="date"
                className={inputCls}
                value={date}
                min={addDays(today, 1)}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Where is it?" hint="Costs differ a lot by city.">
              <select className={inputCls} value={city} onChange={(e) => setCity(e.target.value as CityTier)}>
                {Object.entries(CITY_LABEL).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset className="mt-4">
            <legend className="mb-1 text-sm font-semibold">Functions</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {FUNCTIONS.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={functions.includes(f.id)}
                    disabled={f.id === 'wedding'}
                    onChange={() => toggleFunction(f.id)}
                    className="h-4 w-4 accent-brand"
                  />
                  {f.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Chips
              legend="Where would you happily spend more? (up to 2)"
              value={splurge}
              max={2}
              onToggle={toggle(splurge, setSplurge, save, setSave)}
            />
            <Chips
              legend="Where can you spend less? (up to 2)"
              value={save}
              max={2}
              onToggle={toggle(save, setSave, splurge, setSplurge)}
            />
          </div>

          <div className="mt-4 grid gap-4">
            <Field
              label="What should the wedding feel like?"
              hint="Used for personalised ideas. Mention elders, children, culture, anything."
            >
              <textarea className={inputCls} rows={2} value={vibe} onChange={(e) => setVibe(e.target.value)} />
            </Field>
            <Field label="Absolute must-haves">
              <textarea
                className={inputCls}
                rows={2}
                value={mustHaves}
                onChange={(e) => setMustHaves(e.target.value)}
              />
            </Field>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-lg bg-dangerSoft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="mt-4">
            <Button type="submit">Build my plan</Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
