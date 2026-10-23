export type CategoryId = 'venue' | 'catering' | 'decor' | 'photo' | 'attire' | 'entertainment' | 'invites' | 'stay'

export type FunctionId = 'wedding' | 'reception' | 'sangeet' | 'mehendi' | 'haldi'
export type CityTier = 'metro' | 'tier2' | 'tier3'
export type Priority = 'splurge' | 'normal' | 'save'

/** Everything the user decides. The whole plan is a pure function of this plus task/quote state. */
export interface Profile {
  budget: number
  guests: number
  /** ISO date, YYYY-MM-DD */
  eventDate: string
  city: CityTier
  functions: FunctionId[]
  priorities: Record<CategoryId, Priority>
  vibe: string
  mustHaves: string
}

/** Where a number came from. The UI never shows a bare number without one of these. */
export type Provenance = 'estimate' | 'quote' | 'you'

export interface Money {
  value: number
  provenance: Provenance
}

export interface CategoryLine {
  id: CategoryId
  /** What the plan lets you spend here, after your priorities. */
  allocation: number
  /** Typical-cost range for this city, guest count and function mix (ESTIMATE). */
  low: number
  mid: number
  high: number
  /** The number actually used in totals: booked quote > your own figure > estimate mid. */
  effective: Money
}

export interface BudgetSummary {
  lines: CategoryLine[]
  contingency: number
  /** effective totals + contingency */
  planned: number
  budget: number
  /** planned - budget; positive means over budget */
  gap: number
  /** Share (0-1) of the planned figure that is backed by a quote or your own number. */
  confidence: number
}

export type TaskStatus = 'todo' | 'done'

export interface TaskTemplate {
  id: string
  title: string
  category: CategoryId | 'general'
  /** Must be finished this many days before the event. */
  dueBefore: number
  /** Working days the task realistically takes. */
  duration: number
  dependsOn: string[]
  /** Only included when the event has one of these functions (omit = always). */
  needsFunction?: FunctionId
  why: string
}

export interface TaskState {
  status: TaskStatus
  doneOn?: string
  /** User says this cannot start before this date (e.g. "venue visit only possible after 20 Nov"). */
  notBefore?: string
}

export type TaskHealth = 'done' | 'on_track' | 'tight' | 'at_risk' | 'overdue'

export interface ScheduledTask extends TaskTemplate {
  status: TaskStatus
  start: string
  finish: string
  due: string
  /** Days between the earliest possible finish and the due date. Negative = cannot fit. */
  slack: number
  health: TaskHealth
  notBefore?: string
}

export type QuoteStatus = 'received' | 'shortlisted' | 'booked' | 'rejected'
export type PricingBasis = 'per_plate' | 'per_person' | 'flat' | 'per_day'

export interface ExtractedQuote {
  vendor: string
  basis: PricingBasis
  amount: number
  /** Whether the vendor says GST is included; null = quote does not say. */
  gstIncluded: boolean | null
  guestsCovered: number | null
  advance: number | null
  validTill: string | null
  inclusions: string[]
  exclusions: string[]
  extraCharges: { label: string; amount: number | null }[]
}

/** Result of checking the model's reading of a quote against the pasted text. */
export interface QuoteCheck {
  amountFound: boolean
  inclusionsVerified: string[]
  /** Items the model listed that do not appear in the text. They are dropped. */
  removed: string[]
}

export interface Quote {
  id: string
  category: CategoryId
  status: QuoteStatus
  /** Per-plate prices: does the rate apply to every meal across the functions, or to one meal only? */
  scope?: 'all' | 'one'
  rawText: string
  data: ExtractedQuote
  check: QuoteCheck
}

export type TradeoffKind = 'guests' | 'drop_function' | 'save_category' | 'normal_category'

export interface Tradeoff {
  id: string
  kind: TradeoffKind
  title: string
  detail: string
  saving: number
  /** Overrides applied to the profile if the user picks this option. */
  patch: Partial<Profile>
}

export type Op =
  | { op: 'set_budget'; value: number }
  | { op: 'adjust_budget_pct'; value: number }
  | { op: 'set_guests'; value: number }
  | { op: 'set_event_date'; value: string }
  | { op: 'shift_event_days'; value: number }
  | { op: 'set_city'; value: CityTier }
  | { op: 'set_priority'; category: CategoryId; level: Priority }
  | { op: 'add_function'; value: FunctionId }
  | { op: 'remove_function'; value: FunctionId }
  | { op: 'mark_task_done'; taskId: string }
  | { op: 'delay_task'; taskId: string; notBefore: string }

export interface ChangeEntry {
  at: string
  text: string
}

export interface PlanState {
  profile: Profile
  tasks: Record<string, TaskState>
  quotes: Quote[]
  /** User-entered figures that replace the estimate for a category. */
  own: Partial<Record<CategoryId, number>>
  checklist: Record<string, boolean>
  log: ChangeEntry[]
}

export interface Idea {
  category: CategoryId
  title: string
  description: string
  /** Model's rough cost in INR, ALWAYS an estimate. */
  estCost: number
  why: string
  tradeoff: string
}

export type IdeaFit = 'fits' | 'stretch' | 'over'

export interface AiRequest {
  prompt: string
  systemInstruction: string
  json: boolean
}

export interface AiProvider {
  name: string
  generate(req: AiRequest): Promise<string>
}
