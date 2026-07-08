/**
 * Time-since calculations.
 * Pure, framework-free functions so the (historically buggy) calendar math can
 * be tested rigorously — see timeSince.spec.ts.
 */

export const SECOND = 1000
export const MINUTE = SECOND * 60
export const HOUR = MINUTE * 60
export const DAY = HOUR * 24
export const WEEK = DAY * 7

export type TimeUnit = 'Seconds' | 'Minutes' | 'Hours' | 'Days' | 'Weeks'

export interface CalendarDiff {
  years: number
  months: number
  days: number
  hours: number
  minutes: number
  seconds: number
}

export const numberWithCommas = (x: number): string =>
  x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/**
 * Calendar-aware difference between two instants.
 *
 * Counts *completed* years, then months, then days by advancing a cursor from
 * `from` toward `to` one unit at a time — so variable month lengths and leap
 * years are handled correctly and no component is ever negative (the bug in the
 * original: the day-borrow was left unimplemented, so the night before an
 * anniversary produced negative days / wrong months). The leftover is split
 * into hours / minutes / seconds. If `to` is before `from`, the magnitude of
 * the difference is returned.
 */
export const calendarDiff = (from: Date, to: Date): CalendarDiff => {
  if (to.getTime() < from.getTime()) {
    return calendarDiff(to, from)
  }

  const cursor = new Date(from.getTime())
  let years = 0
  let months = 0
  let days = 0

  const advanceWhile = (step: (d: Date) => void): number => {
    let count = 0
    for (;;) {
      const next = new Date(cursor.getTime())
      step(next)
      if (next.getTime() <= to.getTime()) {
        cursor.setTime(next.getTime())
        count += 1
      } else {
        return count
      }
    }
  }

  years = advanceWhile((d) => d.setFullYear(d.getFullYear() + 1))
  months = advanceWhile((d) => d.setMonth(d.getMonth() + 1))
  days = advanceWhile((d) => d.setDate(d.getDate() + 1))

  let remainder = to.getTime() - cursor.getTime()
  const hours = Math.floor(remainder / HOUR)
  remainder -= hours * HOUR
  const minutes = Math.floor(remainder / MINUTE)
  remainder -= minutes * MINUTE
  const seconds = Math.floor(remainder / SECOND)

  return { years, months, days, hours, minutes, seconds }
}

const plural = (n: number, unit: string): string => `${numberWithCommas(n)} ${unit}${n === 1 ? '' : 's'}`

/**
 * Formats a calendar diff into a headline ("3 Years 2 Months 4 Days", omitting
 * leading zero units) and a remainder ("1 Hour 6 Minutes 55 Seconds").
 */
export const formatCalendar = (diff: CalendarDiff): { main: string; remainder: string } => {
  const parts: string[] = []
  if (diff.years > 0) parts.push(plural(diff.years, 'Year'))
  if (diff.months > 0) parts.push(plural(diff.months, 'Month'))
  if (diff.days > 0) parts.push(plural(diff.days, 'Day'))

  return {
    main: parts.join(' ') || '0 Days',
    remainder: `${plural(diff.hours, 'Hour')} ${plural(diff.minutes, 'Minute')} ${plural(diff.seconds, 'Second')}`,
  }
}

// --- Fixed-length unit breakdowns (from a raw millisecond delta) --------------

export const formatSeconds = (ms: number): string => `${numberWithCommas(Math.floor(ms / SECOND))} Seconds`

export const formatMinutes = (ms: number): string =>
  `${numberWithCommas(Math.floor(ms / MINUTE))} Minutes ${formatSeconds(ms % MINUTE)}`

export const formatHours = (ms: number): string =>
  `${numberWithCommas(Math.floor(ms / HOUR))} Hours ${formatMinutes(ms % HOUR)}`

export const formatDays = (ms: number): string =>
  `${numberWithCommas(Math.floor(ms / DAY))} Days ${formatHours(ms % DAY)}`

export const formatWeeks = (ms: number): string =>
  `${numberWithCommas(Math.floor(ms / WEEK))} Weeks ${formatDays(ms % WEEK)}`

// --- Future-time calculator --------------------------------------------------

export const unitToMs = (unit: TimeUnit | string): number => {
  switch (unit) {
    case 'Seconds':
      return SECOND
    case 'Minutes':
      return MINUTE
    case 'Hours':
      return HOUR
    case 'Days':
      return DAY
    case 'Weeks':
      return WEEK
    default:
      return 0
  }
}

export const addToDate = (base: Date, value: number, unit: TimeUnit | string): Date =>
  new Date(base.getTime() + value * unitToMs(unit))
