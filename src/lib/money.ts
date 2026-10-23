/** Indian digit grouping, e.g. 1234567 -> "12,34,567". */
export function groupIndian(n: number): string {
  const s = String(Math.round(Math.abs(n)))
  if (s.length <= 3) return s
  const last3 = s.slice(-3)
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${rest},${last3}`
}

/** Compact rupee format used everywhere in the UI: ₹8.5 L, ₹1.2 Cr, ₹45,000. */
export function formatINR(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)} Cr`
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)} L`
  return `${sign}₹${groupIndian(abs)}`
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Reads amounts people actually type: "8 lakh", "₹8,00,000", "8.5L", "1.2 cr", "45k", "800000".
 * Returns null when no amount is recognised.
 */
export function parseAmount(text: string): number | null {
  const m = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(crore|cr|lakhs?|lacs?|l|thousand|k)?\b/i.exec(text)
  if (!m) return null
  const base = Number(m[1].replace(/,/g, ''))
  if (!Number.isFinite(base)) return null
  const unit = (m[2] ?? '').toLowerCase()
  if (unit.startsWith('cr')) return Math.round(base * 1_00_00_000)
  if (unit.startsWith('l')) return Math.round(base * 1_00_000)
  if (unit === 'k' || unit === 'thousand') return Math.round(base * 1000)
  return Math.round(base)
}

/** Every amount mentioned in a text, in rupees. Used to check that a quoted price really appears. */
export function allAmounts(text: string): number[] {
  const out: number[] = []
  const re = /(?:₹|rs\.?|inr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(crore|cr|lakhs?|lacs?|l|thousand|k)?\b/gi
  for (const m of text.matchAll(re)) {
    const parsed = parseAmount(m[0])
    if (parsed !== null) out.push(parsed)
  }
  return out
}
