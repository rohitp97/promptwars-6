// @vitest-environment node
import { describe, expect, it } from 'vitest'
// The real palette the UI is built from, so the test can't drift from the styles.
import tailwind from '../../tailwind.config'

const colors: Record<string, string> = tailwind.theme.extend.colors

const linear = (channel: number): number => {
  const v = channel / 255
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16)
  return 0.2126 * linear((n >> 16) & 255) + 0.7152 * linear((n >> 8) & 255) + 0.0722 * linear(n & 255)
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

const AA_NORMAL_TEXT = 4.5

/** [text token, background token, where it is used]. Every pair here appears in the UI. */
const PAIRS: ReadonlyArray<readonly [string, string, string]> = [
  ['ink', 'paper', 'body text'],
  ['ink', 'card', 'body text on cards'],
  ['muted', 'paper', 'secondary text on the page'],
  ['muted', 'card', 'secondary text on cards'],
  ['muted', 'brandSoft', 'secondary text on the soft maroon banner'],
  ['brand', 'paper', 'headings'],
  ['brand', 'card', 'headings, links and tabs on cards'],
  ['brand', 'brandSoft', 'banner heading and hover'],
  ['card', 'brand', 'primary button label and active chip (white on maroon)'],
  ['quote', 'quoteSoft', 'Quoted badge, within-budget verdict'],
  ['quote', 'card', 'under-budget text on white'],
  ['estimate', 'estimateSoft', 'Estimate badge, tight status'],
  ['estimate', 'card', 'estimate text on white'],
  ['you', 'youSoft', 'Your figure badge'],
  ['danger', 'dangerSoft', 'over-budget verdicts, errors'],
  ['danger', 'card', 'over-budget text on white'],
  ['ink', 'estimateSoft', 'text on amber panels'],
  ['ink', 'brandSoft', 'text in the change summary'],
]

describe('colour contrast (WCAG AA, 4.5:1 for normal text)', () => {
  it.each(PAIRS)('%s on %s (%s)', (text, background) => {
    expect(colors[text], `unknown token ${text}`).toBeDefined()
    expect(colors[background], `unknown token ${background}`).toBeDefined()
    expect(contrastRatio(colors[text], colors[background])).toBeGreaterThanOrEqual(AA_NORMAL_TEXT)
  })

  it('computes known reference values correctly', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('actually detects a failing pair (guards against a vacuous test)', () => {
    expect(contrastRatio('#999999', '#ffffff')).toBeLessThan(AA_NORMAL_TEXT)
  })
})
