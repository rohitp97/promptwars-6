import type { AiProvider, CategoryId, ExtractedQuote, Idea, IdeaFit, PlanState, PricingBasis, Quote } from '../types'
import { parseJsonLoose } from './ai'
import { fallbackParseChange } from './fallbackParse'
import { type ParsedOps, parseOps } from './ops'
import { CHANGE_SYSTEM, IDEAS_SYSTEM, QUOTE_SYSTEM, changePrompt, ideasPrompt, quotePrompt } from './prompts'
import { checkExtraction } from './quotes'
import { parseIso } from './dates'

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((s): s is string => s !== null) : [])

export interface ChangeResult extends ParsedOps {
  clarify: string | null
  /** 'ai' when the model read the request, 'rules' when the offline parser did. */
  source: 'ai' | 'rules'
}

export async function interpretChange(
  ai: AiProvider | null,
  state: PlanState,
  text: string,
  today: string,
): Promise<ChangeResult> {
  if (ai) {
    try {
      const raw = await ai.generate({
        systemInstruction: CHANGE_SYSTEM,
        prompt: changePrompt(state, text, today),
        json: true,
      })
      const data = parseJsonLoose(raw)
      if (isRecord(data)) {
        return { ...parseOps(data.ops, today), clarify: str(data.clarify), source: 'ai' }
      }
    } catch (err) {
      console.warn('[shaadi-compass] change interpretation failed, using offline rules:', err)
    }
  }
  return { ...parseOps(fallbackParseChange(text), today), clarify: null, source: 'rules' }
}

const BASES = new Set<PricingBasis>(['per_plate', 'per_person', 'flat', 'per_day'])

export function parseQuoteJson(data: unknown): ExtractedQuote | null {
  if (!isRecord(data) || typeof data.amount !== 'number' || !(data.amount > 0)) return null
  const basis = BASES.has(data.basis as PricingBasis) ? (data.basis as PricingBasis) : 'flat'
  const validTill = str(data.validTill)
  return {
    vendor: str(data.vendor) ?? 'Unnamed vendor',
    basis,
    amount: Math.round(data.amount),
    gstIncluded: typeof data.gstIncluded === 'boolean' ? data.gstIncluded : null,
    guestsCovered: num(data.guestsCovered),
    advance: num(data.advance),
    validTill: validTill && parseIso(validTill) ? validTill : null,
    inclusions: strList(data.inclusions),
    exclusions: strList(data.exclusions),
    extraCharges: Array.isArray(data.extraCharges)
      ? data.extraCharges.filter(isRecord).flatMap((c) => {
          const label = str(c.label)
          return label ? [{ label, amount: num(c.amount) }] : []
        })
      : [],
  }
}

export class QuoteReadError extends Error {}

export async function extractQuote(
  ai: AiProvider | null,
  category: CategoryId,
  rawText: string,
  id: string,
): Promise<Quote> {
  if (!ai)
    throw new QuoteReadError('Reading a pasted quote needs the AI. Add the figure under "Your own number" instead.')
  const raw = await ai.generate({ systemInstruction: QUOTE_SYSTEM, prompt: quotePrompt(category, rawText), json: true })
  const parsed = parseQuoteJson(parseJsonLoose(raw))
  if (!parsed)
    throw new QuoteReadError('No price could be found in that text. Paste the part of the quote with the price.')
  const { data, check } = checkExtraction(rawText, parsed)
  if (!check.amountFound) {
    throw new QuoteReadError(
      `The price ${parsed.amount} was not found in the text you pasted, so it was not trusted. Check the quote and try again.`,
    )
  }
  return { id, category, status: 'received', rawText, data, check }
}

export function parseIdeas(data: unknown, category: CategoryId): Idea[] {
  if (!isRecord(data) || !Array.isArray(data.ideas)) return []
  return data.ideas.filter(isRecord).flatMap((i) => {
    const title = str(i.title)
    const estCost = num(i.estCost)
    if (!title || estCost === null || estCost <= 0) return []
    return [
      {
        category,
        title,
        description: str(i.description) ?? '',
        estCost: Math.round(estCost),
        why: str(i.why) ?? '',
        tradeoff: str(i.tradeoff) ?? '',
      },
    ]
  })
}

/** How an idea's own (estimated) cost compares with what the plan allows for the category. */
export function ideaFit(estCost: number, cap: number): IdeaFit {
  if (estCost <= cap) return 'fits'
  return estCost <= cap * 1.2 ? 'stretch' : 'over'
}

const IDEAS_ATTEMPTS = 2

export async function fetchIdeas(
  ai: AiProvider,
  state: PlanState,
  category: CategoryId,
  cap: number,
  cheaperThan?: string,
): Promise<Idea[]> {
  const request = {
    systemInstruction: IDEAS_SYSTEM,
    prompt: ideasPrompt(state, category, cap, cheaperThan),
    json: true,
  }
  // The smaller models occasionally return JSON with no usable ideas. One more try almost always fixes it.
  for (let attempt = 1; ; attempt++) {
    try {
      const ideas = parseIdeas(parseJsonLoose(await ai.generate(request)), category)
      if (ideas.length > 0 || attempt === IDEAS_ATTEMPTS) return ideas
    } catch (err) {
      if (attempt === IDEAS_ATTEMPTS || !(err instanceof SyntaxError)) throw err
    }
  }
}
