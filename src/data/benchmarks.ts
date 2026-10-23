import type { CategoryId, CityTier, FunctionId, Priority, TaskTemplate } from '../types'

/**
 * Cost benchmarks are ESTIMATES drafted by the app's author from public wedding-cost guides, not
 * live vendor prices and not reviewed by a planner. The UI labels every figure derived from them
 * "estimate" and shows a low-high range; a real quote always replaces them.
 */
export const BENCHMARKS_REVIEWED_ON = '2026-10-23'

export const CATEGORIES: { id: CategoryId; label: string; short: string }[] = [
  { id: 'venue', label: 'Venue & rooms', short: 'Venue' },
  { id: 'catering', label: 'Catering', short: 'Food' },
  { id: 'decor', label: 'Decor & flowers', short: 'Decor' },
  { id: 'photo', label: 'Photo & video', short: 'Photo' },
  { id: 'attire', label: 'Attire, jewellery & beauty', short: 'Attire' },
  { id: 'entertainment', label: 'Music & entertainment', short: 'Music' },
  { id: 'invites', label: 'Invites & gifts', short: 'Invites' },
  { id: 'stay', label: 'Guest stay & travel', short: 'Stay' },
]

export const CITY_LABEL: Record<CityTier, string> = {
  metro: 'Metro (Mumbai, Delhi, Bengaluru…)',
  tier2: 'Tier-2 city (Jaipur, Indore, Kochi…)',
  tier3: 'Smaller town',
}

export const FUNCTIONS: { id: FunctionId; label: string; meal: number; venue: number; decor: number }[] = [
  { id: 'wedding', label: 'Wedding ceremony', meal: 1, venue: 1, decor: 1 },
  { id: 'reception', label: 'Reception', meal: 1, venue: 0.9, decor: 0.8 },
  { id: 'sangeet', label: 'Sangeet', meal: 0.8, venue: 0.7, decor: 0.6 },
  { id: 'mehendi', label: 'Mehendi', meal: 0.5, venue: 0.3, decor: 0.3 },
  { id: 'haldi', label: 'Haldi', meal: 0.4, venue: 0.2, decor: 0.25 },
]

export function functionInfo(id: FunctionId) {
  const found = FUNCTIONS.find((f) => f.id === id)
  if (!found) throw new Error(`Unknown function ${id}`)
  return found
}

/** Catering: INR per plate (a full meal) at an average multi-cuisine menu. */
export const PLATE_RATE: Record<CityTier, number> = { metro: 1500, tier2: 1000, tier3: 700 }
/** Venue: INR per guest per full-day function (hall + rooms for family, no food). */
export const VENUE_PER_GUEST: Record<CityTier, number> = { metro: 1400, tier2: 900, tier3: 550 }
/** Decor for a single full function with 200 guests. Scales with the square root of guests. */
export const DECOR_BASE: Record<CityTier, number> = { metro: 300_000, tier2: 190_000, tier3: 110_000 }
/** Photo and video for the main function; extra functions add 30% each. */
export const PHOTO_BASE: Record<CityTier, number> = { metro: 200_000, tier2: 130_000, tier3: 80_000 }
/** Outfits, jewellery and beauty for the couple and close family: mostly independent of guest count. */
export const ATTIRE_BASE: Record<CityTier, number> = { metro: 450_000, tier2: 300_000, tier3: 200_000 }
/** DJ, band, host and sound. Heavier when there is a sangeet. */
export const ENTERTAINMENT_BASE: Record<CityTier, number> = { metro: 100_000, tier2: 65_000, tier3: 40_000 }
export const SANGEET_ENTERTAINMENT_MULTIPLIER = 2.2
/** Cards, digital invites and return gifts, per guest. */
export const INVITES_PER_GUEST: Record<CityTier, number> = { metro: 450, tier2: 320, tier3: 220 }
/** Guest stay and travel: share of guests needing rooms (0.3) times a rate per room-night, 2 nights, 2 per room. */
export const STAY_PER_GUEST: Record<CityTier, number> = { metro: 1700, tier2: 1100, tier3: 800 }

export const PRIORITY_MULTIPLIER: Record<Priority, number> = { splurge: 1.3, normal: 1, save: 0.75 }
/** Spread of the estimate range around the middle figure. */
export const RANGE_LOW = 0.8
export const RANGE_HIGH = 1.3

/** Reserve held back for surprises. Weddings overrun; this is policy, not an estimate. */
export const CONTINGENCY_SHARE = 0.1

/** What to confirm with each vendor type, in the order it tends to bite. */
export const VENDOR_CHECKLIST: Record<CategoryId, string[]> = {
  venue: [
    'Is the quote per day or per function, and until what time?',
    'Is catering exclusive to the venue, or can we bring our own caterer (and at what outside-caterer fee)?',
    'What is the capacity for seated meals vs. standing, and is there a backup for rain or power cuts?',
    'Are rooms included? How many, and what is the extra-room rate?',
    'Parking, valet, generator and sound-curfew rules?',
    'Advance, instalment dates and cancellation terms in writing?',
  ],
  catering: [
    'Is the rate per plate, and does it include service staff, crockery and live counters?',
    'GST on the quote: included or extra, and at what rate?',
    'Minimum guarantee of plates and the rate for extra plates?',
    'What happens to the menu if the guest count rises or falls close to the date?',
    'Tasting date, and can the menu change after it?',
    'Are liquor, mocktails and late-night snacks covered?',
  ],
  decor: [
    'Which items are in the quote (stage, mandap, entrance, centrepieces) and which are extra?',
    'Fresh vs. artificial flowers and how this affects price',
    'Setup and breakdown timing, and who clears the material',
    'Power and rigging needs the venue must allow',
  ],
  photo: [
    'Number of photographers and videographers on each function',
    'Hours covered, and the overtime rate',
    'Delivery time and format for photos, album and film',
    'Drone, pre-wedding shoot and travel charges, if any',
    'Who owns the raw files, and how long are they stored?',
  ],
  attire: [
    'Fitting and alteration dates well before the event',
    'Rental vs. buy, with refundable deposit for rentals',
    'Makeup and hair trial dates, and the artist for the day itself',
  ],
  entertainment: [
    'Setlist control and sound check timing',
    'Sound, lights and generator included?',
    'Performance hours and overtime rate',
    'Choreographer sessions for the sangeet, if wanted',
  ],
  invites: [
    'Print proof approval and delivery date',
    'Digital invite and RSVP collection method',
    'Return-gift quantity with a spare 10%',
  ],
  stay: [
    'Room blocks: how many, which nights, and the release date for unsold rooms',
    'Transport between venue and hotels, and airport or station pickup',
    'Check-in and check-out times against the function schedule',
  ],
}

/**
 * Task templates. `dueBefore` is days before the event by which the task must be finished; the
 * scheduler works out whether it still fits from today, given the dependencies and durations.
 * Lead times are typical for Indian weddings and are the author's judgement, shown in the UI.
 */
export const TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: 'budget',
    title: 'Agree the budget and what matters most',
    category: 'general',
    dueBefore: 95,
    duration: 3,
    dependsOn: [],
    why: 'Every other decision is limited by this. Do it first, with both families.',
  },
  {
    id: 'guestlist',
    title: 'Draft the guest list (both sides)',
    category: 'general',
    dueBefore: 85,
    duration: 10,
    dependsOn: ['budget'],
    why: 'Guest count drives venue size and the biggest line, food.',
  },
  {
    id: 'muhurat',
    title: 'Confirm muhurat and rituals with the priest',
    category: 'general',
    dueBefore: 85,
    duration: 5,
    dependsOn: [],
    why: 'Timings decide how long you need the venue and decor team.',
  },
  {
    id: 'venue',
    title: 'Visit, shortlist and book the venue',
    category: 'venue',
    dueBefore: 70,
    duration: 14,
    dependsOn: ['guestlist', 'muhurat'],
    why: 'Good venues book out first; most other vendors need the venue confirmed.',
  },
  {
    id: 'photo',
    title: 'Book photographer and videographer',
    category: 'photo',
    dueBefore: 55,
    duration: 10,
    dependsOn: ['venue'],
    why: 'Popular teams are taken months ahead for peak dates.',
  },
  {
    id: 'caterer',
    title: 'Get caterer quotes and book',
    category: 'catering',
    dueBefore: 50,
    duration: 14,
    dependsOn: ['venue', 'guestlist'],
    why: 'Catering is usually the largest line. Compare quotes on the same guest count.',
  },
  {
    id: 'decor',
    title: 'Finalise decor theme and book decorator',
    category: 'decor',
    dueBefore: 45,
    duration: 14,
    dependsOn: ['venue'],
    why: 'The venue sets what can be hung, lit or built.',
  },
  {
    id: 'attire',
    title: 'Shop and order outfits and jewellery',
    category: 'attire',
    dueBefore: 38,
    duration: 30,
    dependsOn: ['budget'],
    why: 'Stitching and alterations take weeks; leave time for a second fitting.',
  },
  {
    id: 'entertainment',
    title: 'Book DJ, band or host',
    category: 'entertainment',
    dueBefore: 40,
    duration: 10,
    dependsOn: ['venue'],
    needsFunction: 'sangeet',
    why: 'Sangeet quality depends on the act and the sound setup at the venue.',
  },
  {
    id: 'invites',
    title: 'Design and print invites',
    category: 'invites',
    dueBefore: 48,
    duration: 10,
    dependsOn: ['guestlist', 'venue'],
    why: 'Invites need the date, venue and function schedule locked.',
  },
  {
    id: 'send_invites',
    title: 'Send invites (4-8 weeks ahead)',
    category: 'invites',
    dueBefore: 40,
    duration: 5,
    dependsOn: ['invites'],
    why: 'Outstation guests need time to book travel.',
  },
  {
    id: 'stay',
    title: 'Block rooms and plan transport for guests',
    category: 'stay',
    dueBefore: 42,
    duration: 10,
    dependsOn: ['guestlist', 'venue'],
    why: 'Block rooms early; peak-date hotels sell out.',
  },
  {
    id: 'mehendi',
    title: 'Book mehendi artists',
    category: 'general',
    dueBefore: 28,
    duration: 5,
    dependsOn: ['venue'],
    needsFunction: 'mehendi',
    why: 'Plan one artist per 8-10 guests who want a design.',
  },
  {
    id: 'menu',
    title: 'Menu tasting and final menu',
    category: 'catering',
    dueBefore: 28,
    duration: 5,
    dependsOn: ['caterer'],
    why: 'Lock the menu while there is still time to change caterers if the tasting disappoints.',
  },
  {
    id: 'rsvp',
    title: 'Chase RSVPs and fix the final guest count',
    category: 'general',
    dueBefore: 14,
    duration: 14,
    dependsOn: ['send_invites'],
    why: 'Caterers bill on the final count; this protects the food budget.',
  },
  {
    id: 'confirm',
    title: 'Confirm every vendor and settle balances',
    category: 'general',
    dueBefore: 7,
    duration: 5,
    dependsOn: ['rsvp', 'menu'],
    why: 'A confirmation call per vendor catches mistakes while they are fixable.',
  },
  {
    id: 'runsheet',
    title: 'Share the day-of run sheet with every vendor and family lead',
    category: 'general',
    dueBefore: 3,
    duration: 2,
    dependsOn: ['confirm'],
    why: 'One shared timeline avoids a dozen phone calls on the day.',
  },
]

/** How many full meals the functions add up to (a wedding is 1, a sangeet 0.8, and so on). */
export function mealCount(functions: FunctionId[]): number {
  return functions.reduce((sum, id) => sum + functionInfo(id).meal, 0)
}
