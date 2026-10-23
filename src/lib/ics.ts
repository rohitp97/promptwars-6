import type { ScheduledTask } from '../types'
import { addDays } from './dates'

const compact = (iso: string) => iso.replace(/-/g, '')

export function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** All-day calendar entries: one per open task (on its due date) plus the event itself. */
export function buildIcs(tasks: ScheduledTask[], eventDate: string, stamp: string): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Shaadi Compass//EN', 'CALSCALE:GREGORIAN']
  const add = (uid: string, date: string, summary: string, description: string) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}@shaadi-compass`,
      `DTSTAMP:${compact(stamp)}T000000Z`,
      `DTSTART;VALUE=DATE:${compact(date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`,
      `SUMMARY:${escapeIcs(summary)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      'END:VEVENT',
    )
  }
  add('event', eventDate, 'The wedding', 'Planned with Shaadi Compass')
  for (const t of tasks.filter((t) => t.status !== 'done')) {
    add(`task-${t.id}`, t.due, `Due: ${t.title}`, t.why)
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
