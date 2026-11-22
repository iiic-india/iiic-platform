'use client'

import { useId } from 'react'

import { dayParts, timeOf } from '@/lib/bookingFlow/format'

import { FLOW_COPY } from './copy'

export type SlotDays = { day: string; starts: string[] }[]

/**
 * Step 2's date strip and free times (docs/03 F3; src/brand/gallery.html, "Date strip and
 * slots"): two radio groups in fieldsets, so arrow keys move within each and Tab between them
 * (docs/03 F3, Accessibility). Only the times the slot engine offers are drawn; days without one
 * are left out by the engine.
 */
export function TimePicker({
  days,
  day,
  startsAt,
  onDay,
  onTime,
}: {
  days: SlotDays
  day: string | null
  startsAt: string | null
  onDay: (day: string) => void
  onTime: (startsAt: string) => void
}) {
  const name = useId()
  const chosen = days.find((entry) => entry.day === day) ?? null
  return (
    <>
      <fieldset className="iiic-fieldset">
        <legend>{FLOW_COPY.dayLegend}</legend>
        <div className="iiic-dates">
          {days.map((entry) => {
            const parts = dayParts(entry.day)
            return (
              <label className="iiic-date" key={entry.day}>
                <input
                  type="radio"
                  name={`${name}-day`}
                  value={entry.day}
                  checked={entry.day === day}
                  onChange={() => onDay(entry.day)}
                />
                <span>
                  <small>{parts.weekday}</small>
                  <strong>{parts.date}</strong>
                  <small>{parts.month}</small>
                </span>
              </label>
            )
          })}
        </div>
      </fieldset>
      {chosen ? (
        <fieldset className="iiic-fieldset">
          <legend>{FLOW_COPY.timeLegend}</legend>
          <div className="iiic-slots">
            {chosen.starts.map((start) => (
              <label className="iiic-slot" key={start}>
                <input
                  type="radio"
                  name={`${name}-time`}
                  value={start}
                  checked={start === startsAt}
                  onChange={() => onTime(start)}
                />
                <span>{timeOf(start)}</span>
              </label>
            ))}
          </div>
          <p className="iiic-type-small">{FLOW_COPY.timesInIndia}</p>
        </fieldset>
      ) : null}
    </>
  )
}
