import { useState } from 'react'
import { buildIcs } from '../lib/ics'
import { addDays, formatDate } from '../lib/dates'
import type { PlanApi } from '../hooks/usePlan'
import type { ScheduledTask, TaskHealth } from '../types'
import { Button, Card, inputCls } from './ui'

const HEALTH: Record<TaskHealth, { label: string; cls: string }> = {
  done: { label: 'Done', cls: 'bg-quoteSoft text-quote' },
  on_track: { label: 'On track', cls: 'bg-quoteSoft text-quote' },
  tight: { label: 'Tight', cls: 'bg-estimateSoft text-estimate' },
  at_risk: { label: 'Cannot fit', cls: 'bg-dangerSoft text-danger' },
  overdue: { label: 'Overdue', cls: 'bg-dangerSoft text-danger' },
}

function TaskRow({ task, api }: { task: ScheduledTask; api: PlanApi }) {
  const [delaying, setDelaying] = useState(false)
  const [date, setDate] = useState('')
  const done = task.status === 'done'
  const h = HEALTH[task.health]
  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={done}
          onChange={() => api.toggleTask(task.id)}
          aria-label={`Mark "${task.title}" ${done ? 'not done' : 'done'}`}
          className="mt-1 h-5 w-5 shrink-0 accent-brand"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-semibold ${done ? 'text-muted line-through' : ''}`}>{task.title}</p>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${h.cls}`}>{h.label}</span>
          </div>
          {!done && (
            <p className="text-sm text-muted">
              Due {formatDate(task.due)} · earliest finish {formatDate(task.finish)}
              {task.slack < 0 && <b className="text-danger"> · {-task.slack} days too late</b>}
              {task.notBefore && <span> · you said not before {formatDate(task.notBefore)}</span>}
            </p>
          )}
          {!done && <p className="text-sm text-muted">{task.why}</p>}
          {!done && (
            <div className="mt-1">
              {delaying ? (
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (date) api.delayTask(task.id, date)
                    setDelaying(false)
                  }}
                >
                  <label className="text-sm" htmlFor={`delay-${task.id}`}>
                    Can't start before
                  </label>
                  <input
                    id={`delay-${task.id}`}
                    type="date"
                    className={`${inputCls} w-auto`}
                    min={addDays(api.today, 1)}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                  <Button type="submit" variant="secondary" disabled={!date}>
                    Save
                  </Button>
                  <Button variant="ghost" onClick={() => setDelaying(false)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="text-sm font-semibold text-brand underline"
                    onClick={() => setDelaying(true)}
                  >
                    It's delayed
                  </button>
                  {task.notBefore && (
                    <button
                      type="button"
                      className="text-sm font-semibold text-brand underline"
                      onClick={() => api.delayTask(task.id, null)}
                    >
                      Clear delay
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}

export function TimelineView({ api }: { api: PlanApi }) {
  const { plan, derived, today } = api
  if (!plan || !derived) return null
  const { tasks, timeline } = derived

  const download = () => {
    const blob = new Blob([buildIcs(tasks, plan.profile.eventDate, today)], { type: 'text/calendar' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'wedding-plan.ics'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card
      title="Timeline"
      action={
        <Button variant="secondary" onClick={download}>
          Add due dates to my calendar (.ics)
        </Button>
      }
    >
      <p className="mb-2 text-sm text-muted">
        Each task is scheduled forward from today, after the tasks it depends on. "Cannot fit" means that even starting
        now it would finish after its due date, so something must be done in parallel or faster.
        {timeline.atRisk + timeline.overdue > 0 && ' Move the date later or start the red items first.'}
      </p>
      <ul className="divide-y divide-line">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} api={api} />
        ))}
      </ul>
    </Card>
  )
}
