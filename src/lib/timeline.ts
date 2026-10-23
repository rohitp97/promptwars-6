import { TASK_TEMPLATES } from '../data/benchmarks'
import type { PlanState, ScheduledTask, TaskHealth, TaskTemplate } from '../types'
import { addDays, daysBetween, maxIso } from './dates'

export const TIGHT_SLACK_DAYS = 7

export function templatesFor(functions: PlanState['profile']['functions']): TaskTemplate[] {
  return TASK_TEMPLATES.filter((t) => !t.needsFunction || functions.includes(t.needsFunction))
}

/**
 * Schedules every task forward from today, respecting dependencies, durations and any "not before"
 * dates the user set. The result is what is actually achievable, not an ideal calendar: a task
 * whose earliest possible finish is after its due date is `at_risk` and says by how many days.
 * Because it is recomputed from scratch, moving the event date, delaying a task or ticking one off
 * re-plans everything downstream with no special-case code.
 */
export function scheduleTasks(state: PlanState, today: string): ScheduledTask[] {
  const { eventDate, functions } = state.profile
  const templates = templatesFor(functions)
  const byId = new Map(templates.map((t) => [t.id, t]))
  const finished = new Map<string, ScheduledTask>()

  const schedule = (t: TaskTemplate, trail: string[]): ScheduledTask => {
    const cached = finished.get(t.id)
    if (cached) return cached
    if (trail.includes(t.id)) throw new Error(`Task dependency cycle at ${t.id}`)
    const deps = t.dependsOn.map((id) => byId.get(id)).filter((d): d is TaskTemplate => d !== undefined)
    const scheduledDeps = deps.map((d) => schedule(d, [...trail, t.id]))

    const task = state.tasks[t.id]
    const due = addDays(eventDate, -t.dueBefore)
    let start: string
    let finish: string
    let health: TaskHealth
    let slack: number

    if (task?.status === 'done') {
      start = finish = task.doneOn && task.doneOn <= today ? task.doneOn : today
      health = 'done'
      slack = daysBetween(finish, due)
    } else {
      const notBefore = task?.notBefore
      start = maxIso(today, notBefore ?? today, ...scheduledDeps.map((d) => d.finish))
      finish = addDays(start, t.duration)
      slack = daysBetween(finish, due)
      if (today > due) health = 'overdue'
      else if (slack < 0) health = 'at_risk'
      else if (slack < TIGHT_SLACK_DAYS) health = 'tight'
      else health = 'on_track'
    }

    const result: ScheduledTask = {
      ...t,
      status: task?.status ?? 'todo',
      start,
      finish,
      due,
      slack,
      health,
      notBefore: task?.notBefore,
    }
    finished.set(t.id, result)
    return result
  }

  return templates
    .map((t) => schedule(t, []))
    .sort((a, b) => a.due.localeCompare(b.due) || a.start.localeCompare(b.start))
}

export interface TimelineSummary {
  total: number
  done: number
  atRisk: number
  tight: number
  overdue: number
  daysToEvent: number
  /** The first task that needs attention, for the "do this next" card. */
  next: ScheduledTask | null
}

export function summarizeTimeline(tasks: ScheduledTask[], eventDate: string, today: string): TimelineSummary {
  const open = tasks.filter((t) => t.status !== 'done')
  const urgent = (t: ScheduledTask) =>
    t.health === 'overdue' ? 0 : t.health === 'at_risk' ? 1 : t.health === 'tight' ? 2 : 3
  const next = [...open].sort((a, b) => urgent(a) - urgent(b) || a.due.localeCompare(b.due))[0] ?? null
  return {
    total: tasks.length,
    done: tasks.length - open.length,
    atRisk: open.filter((t) => t.health === 'at_risk').length,
    tight: open.filter((t) => t.health === 'tight').length,
    overdue: open.filter((t) => t.health === 'overdue').length,
    daysToEvent: daysBetween(today, eventDate),
    next,
  }
}

/** Tasks that cannot meet their due date even if started today. Used to explain a too-short runway. */
export function infeasibleTasks(tasks: ScheduledTask[]): ScheduledTask[] {
  return tasks.filter((t) => t.status !== 'done' && (t.health === 'at_risk' || t.health === 'overdue'))
}
