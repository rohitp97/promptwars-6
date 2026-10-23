import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { Provenance } from '../types'

const PROVENANCE: Record<Provenance, { label: string; cls: string; hint: string }> = {
  estimate: {
    label: 'Estimate',
    cls: 'bg-estimateSoft text-estimate border-estimate/40',
    hint: 'A typical cost for your city and guest count. Not a price anyone has quoted.',
  },
  quote: {
    label: 'Quoted',
    cls: 'bg-quoteSoft text-quote border-quote/40',
    hint: 'From a vendor quote you booked, with the price found in the text you pasted.',
  },
  you: {
    label: 'Your figure',
    cls: 'bg-youSoft text-you border-you/40',
    hint: 'A number you entered yourself.',
  },
}

export function ProvenanceBadge({ kind }: { kind: Provenance }) {
  const p = PROVENANCE[kind]
  return (
    <span
      title={p.hint}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${p.cls}`}
    >
      {p.label}
    </span>
  )
}

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: ReactNode
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl border border-line bg-card p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="font-serif text-lg font-semibold text-ink">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-brand text-white hover:bg-[#5f1730] disabled:bg-muted',
  secondary: 'border border-brand bg-white text-brand hover:bg-brandSoft',
  ghost: 'text-brand hover:bg-brandSoft',
  danger: 'border border-danger bg-white text-danger hover:bg-dangerSoft',
}

export function Button({ variant = 'primary', className = '', type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      {...rest}
      className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT[variant]} ${className}`}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-brand'

export function Bar({ value, max, over }: { value: number; max: number; over?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
      <div className={`h-full ${over ? 'bg-danger' : 'bg-brand'}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
