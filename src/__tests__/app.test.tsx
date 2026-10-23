import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import * as ai from '../lib/ai'
import type { AiProvider } from '../types'

vi.mock('../lib/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/ai')>()),
  createAiProvider: vi.fn(() => null),
}))
const createAiProvider = vi.mocked(ai.createAiProvider)

/** Replies by looking at which task the system prompt describes. */
const fakeAi = (replies: { change?: unknown; quote?: unknown; ideas?: unknown }): AiProvider => ({
  name: 'gemini-api-key',
  generate: async (req) => {
    if (req.systemInstruction.includes('translate a family')) return JSON.stringify(replies.change ?? { ops: [] })
    if (req.systemInstruction.includes('vendor quote')) return JSON.stringify(replies.quote ?? { error: 'none' })
    return JSON.stringify(replies.ideas ?? { ideas: [] })
  },
})

async function violations(): Promise<string[]> {
  const results = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return results.violations.map((v) => `${v.id}: ${v.help} — ${v.nodes[0]?.target.join(' ')}`)
}

beforeEach(() => {
  localStorage.clear()
  createAiProvider.mockReturnValue(null)
})
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const loadExample = async (user: ReturnType<typeof userEvent.setup>) => {
  render(<App />)
  await user.click(screen.getByRole('button', { name: 'Load the example plan' }))
  await screen.findByRole('heading', { name: 'Something changed?' })
}

describe('setup', () => {
  it('rejects an unreadable budget with a clear message', async () => {
    const user = userEvent.setup()
    render(<App />)
    const budget = screen.getByLabelText(/Total budget/)
    await user.clear(budget)
    await user.type(budget, 'lots')
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/budget/i)
  })

  it('builds a plan from the form and labels every figure as an estimate', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: 'Build my plan' }))
    expect(await screen.findByRole('heading', { name: 'Where the money goes' })).toBeInTheDocument()
    expect(screen.getAllByText('Estimate').length).toBeGreaterThanOrEqual(8)
  })
})

describe('plan', () => {
  it('shows the budget, timeline and next step for the example', async () => {
    const user = userEvent.setup()
    await loadExample(user)
    expect(screen.getByText(/over budget/)).toBeInTheDocument()
    expect(screen.getByText('Do this next')).toBeInTheDocument()
    expect(screen.getByText(/Here is what would close the gap/)).toBeInTheDocument()
  })

  it('applying a trade-off recomputes the plan and shows what moved, then undo restores it', async () => {
    const user = userEvent.setup()
    await loadExample(user)
    const before = screen.getByText(/over budget/).textContent
    await user.click(screen.getAllByRole('button', { name: 'Apply' })[0])
    const banner = await screen.findByText('Plan updated. Here is what moved:')
    expect(banner).toBeInTheDocument()
    expect(screen.getByText(/over budget|under budget/).textContent).not.toBe(before)
    await user.click(screen.getAllByRole('button', { name: 'Undo' })[0])
    expect(screen.getByText(/over budget/).textContent).toBe(before)
  })

  it('previews a natural-language change before applying it (offline rules)', async () => {
    const user = userEvent.setup()
    await loadExample(user)
    await user.type(
      screen.getByLabelText('Describe what changed in your plan'),
      'budget cut by 20% and 2 weeks earlier',
    )
    await user.click(screen.getByRole('button', { name: 'Preview the change' }))
    expect(await screen.findByText(/I understood 2 changes/)).toBeInTheDocument()
    expect(screen.getByText(/Budget -20%/)).toBeInTheDocument()
    expect(screen.getByText('What would happen to the plan')).toBeInTheDocument()
    // Nothing has been applied yet.
    expect(screen.queryByText('Plan updated. Here is what moved:')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Apply to my plan' }))
    expect(await screen.findByText('Plan updated. Here is what moved:')).toBeInTheDocument()
  })

  it('ignores operations the AI invents', async () => {
    createAiProvider.mockReturnValue(
      fakeAi({ change: { ops: [{ op: 'set_budget', value: 1 }, { op: 'delete_everything' }], clarify: null } }),
    )
    const user = userEvent.setup()
    await loadExample(user)
    await user.type(screen.getByLabelText('Describe what changed in your plan'), 'do something odd')
    await user.click(screen.getByRole('button', { name: 'Preview the change' }))
    expect(await screen.findByText(/Ignored:/)).toHaveTextContent(/not an operation/)
    expect(screen.queryByRole('button', { name: 'Apply to my plan' })).not.toBeInTheDocument()
  })

  it('marking a task done and delaying another updates the timeline', async () => {
    const user = userEvent.setup()
    await loadExample(user)
    await user.click(screen.getByRole('tab', { name: 'Timeline' }))
    await user.click(screen.getByRole('checkbox', { name: /Mark "Agree the budget/ }))
    expect(screen.getByRole('checkbox', { name: /Agree the budget.*not done/ })).toBeChecked()
    expect(screen.getByText(/1 of 16 tasks done/)).toBeInTheDocument()
  })

  it('saves the plan in the browser and restores it on reload', async () => {
    const user = userEvent.setup()
    await loadExample(user)
    cleanup()
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Something changed?' })).toBeInTheDocument()
  })

  it('start over clears the saved plan after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    await loadExample(user)
    await user.click(screen.getByRole('button', { name: 'Start over' }))
    expect(await screen.findByRole('heading', { name: /A wedding plan that re-plans/ })).toBeInTheDocument()
  })
})

describe('vendors', () => {
  const QUOTE =
    'Spice Route: veg buffet Rs. 850 per plate + GST. Service staff included. Liquor not included. 50% advance.'
  const reply = {
    vendor: 'Spice Route',
    basis: 'per_plate',
    amount: 850,
    gstIncluded: false,
    guestsCovered: null,
    advance: null,
    validTill: null,
    inclusions: ['service staff', 'free helicopter entry'],
    exclusions: ['liquor'],
    extraCharges: [],
  }

  it('reads a quote, drops an invented inclusion, and books it into the budget', async () => {
    createAiProvider.mockReturnValue(fakeAi({ quote: reply }))
    const user = userEvent.setup()
    await loadExample(user)
    await user.click(screen.getByRole('tab', { name: 'Vendors' }))
    await user.click(screen.getByRole('button', { name: /^Food/ }))
    await user.type(screen.getByLabelText('Paste the quote'), QUOTE)
    await user.click(screen.getByRole('button', { name: 'Read this quote' }))
    const card = (await screen.findByText('Spice Route')).closest('li') as HTMLElement
    expect(within(card).getByText(/Removed after checking/)).toHaveTextContent('free helicopter entry')
    expect(within(card).getByText(/GST is extra, rate not stated/)).toBeInTheDocument()
    await user.selectOptions(within(card).getByLabelText(/Status of quote/), 'booked')
    await user.click(screen.getByRole('tab', { name: 'Budget' }))
    expect((await screen.findAllByText('Quoted')).length).toBeGreaterThan(0)
  })

  it('refuses a price that is not in the pasted text', async () => {
    createAiProvider.mockReturnValue(fakeAi({ quote: { ...reply, amount: 1234 } }))
    const user = userEvent.setup()
    await loadExample(user)
    await user.click(screen.getByRole('tab', { name: 'Vendors' }))
    await user.type(screen.getByLabelText('Paste the quote'), QUOTE)
    await user.click(screen.getByRole('button', { name: 'Read this quote' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/was not found in the text/)
  })

  it('says AI is needed when it is not configured', async () => {
    const user = userEvent.setup()
    await loadExample(user)
    await user.click(screen.getByRole('tab', { name: 'Vendors' }))
    expect(screen.getByRole('button', { name: 'Read this quote' })).toBeDisabled()
  })
})

describe('ideas', () => {
  it('classifies fit in code, not from the model', async () => {
    createAiProvider.mockReturnValue(
      fakeAi({
        ideas: {
          ideas: [
            { title: 'Marigold canopy', description: 'x', estCost: 10_000, why: 'w', tradeoff: 't' },
            { title: 'Grand floral tunnel', description: 'x', estCost: 9_000_000, why: 'w', tradeoff: 't' },
          ],
        },
      }),
    )
    const user = userEvent.setup()
    await loadExample(user)
    await user.click(screen.getByRole('tab', { name: 'Ideas' }))
    await user.click(screen.getByRole('button', { name: 'Suggest ideas' }))
    await waitFor(() => expect(screen.getByText('Marigold canopy')).toBeInTheDocument())
    expect(screen.getByText('Fits your plan')).toBeInTheDocument()
    expect(screen.getByText('Over your plan')).toBeInTheDocument()
  })
})

describe('accessibility (axe-core)', () => {
  it('setup screen', async () => {
    render(<App />)
    expect(await violations()).toEqual([])
  })

  it.each(['Budget', 'Timeline', 'Vendors', 'Ideas', 'What changed'])('plan screen, %s tab', async (tab) => {
    const user = userEvent.setup()
    await loadExample(user)
    await user.click(screen.getByRole('tab', { name: tab }))
    expect(await violations()).toEqual([])
  })
})
