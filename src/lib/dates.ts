const MS_PER_DAY = 86_400_000

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Parses YYYY-MM-DD as a UTC date; returns null for anything that is not a real calendar date. */
export function parseIso(iso: string): Date | null {
  const m = ISO_RE.exec(iso)
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  return toIso(date) === iso ? date : null
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, days: number): string {
  const date = parseIso(iso)
  if (!date) throw new Error(`Invalid date: ${iso}`)
  return toIso(new Date(date.getTime() + days * MS_PER_DAY))
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = parseIso(a)
  const db = parseIso(b)
  if (!da || !db) throw new Error(`Invalid date: ${a} / ${b}`)
  return Math.round((db.getTime() - da.getTime()) / MS_PER_DAY)
}

export function todayIso(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return toIso(local)
}

export function maxIso(...dates: string[]): string {
  return dates.reduce((a, b) => (a >= b ? a : b))
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(iso: string): string {
  const d = parseIso(iso)
  if (!d) return iso
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}
