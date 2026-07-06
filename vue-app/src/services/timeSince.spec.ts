import { describe, it, expect } from 'vitest'
import {
  SECOND,
  MINUTE,
  HOUR,
  DAY,
  WEEK,
  numberWithCommas,
  calendarDiff,
  formatCalendar,
  formatSeconds,
  formatMinutes,
  formatHours,
  formatDays,
  formatWeeks,
  unitToMs,
  addToDate,
} from './timeSince'

// Local-time constructor keeps tests timezone-independent (calendarDiff uses local getters).
const d = (y: number, mo: number, day: number, h = 0, mi = 0, s = 0) =>
  new Date(y, mo - 1, day, h, mi, s)

describe('numberWithCommas', () => {
  it('groups thousands', () => {
    expect(numberWithCommas(0)).toBe('0')
    expect(numberWithCommas(999)).toBe('999')
    expect(numberWithCommas(1000)).toBe('1,000')
    expect(numberWithCommas(1234567)).toBe('1,234,567')
  })
})

describe('fixed-length unit breakdowns', () => {
  it('formatSeconds floors to whole seconds', () => {
    expect(formatSeconds(5 * SECOND + 500)).toBe('5 Seconds')
    expect(formatSeconds(0)).toBe('0 Seconds')
  })

  it('formatMinutes splits minutes and seconds', () => {
    expect(formatMinutes(2 * MINUTE + 30 * SECOND)).toBe('2 Minutes 30 Seconds')
    expect(formatMinutes(59 * SECOND)).toBe('0 Minutes 59 Seconds')
  })

  it('formatHours cascades down to seconds', () => {
    expect(formatHours(3 * HOUR + 4 * MINUTE + 5 * SECOND)).toBe('3 Hours 4 Minutes 5 Seconds')
  })

  it('formatDays cascades and adds commas to large counts', () => {
    expect(formatDays(1403 * DAY + HOUR + 6 * MINUTE + 55 * SECOND)).toBe(
      '1,403 Days 1 Hours 6 Minutes 55 Seconds',
    )
  })

  it('formatWeeks splits weeks then days', () => {
    expect(formatWeeks(2 * WEEK + 3 * DAY + HOUR)).toBe(
      '2 Weeks 3 Days 1 Hours 0 Minutes 0 Seconds',
    )
  })
})

describe('calendarDiff', () => {
  it('is all zeros for identical instants', () => {
    expect(calendarDiff(d(2022, 9, 2, 11, 7, 22), d(2022, 9, 2, 11, 7, 22))).toEqual({
      years: 0,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
  })

  it('reports an exact anniversary as a whole year', () => {
    expect(calendarDiff(d(2022, 9, 2, 11, 7, 22), d(2023, 9, 2, 11, 7, 22))).toMatchObject({
      years: 1,
      months: 0,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
    })
  })

  it('borrows seconds/minutes/hours correctly', () => {
    // 22 seconds short of a clean day
    const diff = calendarDiff(d(2022, 9, 2, 11, 7, 22), d(2022, 9, 3, 11, 7, 0))
    expect(diff).toMatchObject({ years: 0, months: 0, days: 0, hours: 23, minutes: 59, seconds: 38 })
  })

  // The historical bug: the night before an anniversary produced negative days.
  it('handles the night before an anniversary without going negative', () => {
    const diff = calendarDiff(d(2022, 9, 2, 11, 7, 22), d(2023, 9, 1, 23, 0, 0))
    expect(diff.years).toBe(0)
    expect(diff.months).toBe(11)
    expect(diff.days).toBe(30) // Sep has 30 days; Aug 2 -> Sep 1 = 30 days
    expect(diff.days).toBeGreaterThanOrEqual(0)
    expect(diff).toMatchObject({ hours: 11, minutes: 52, seconds: 38 })
  })

  // The day before a month-aversary: months must NOT tick over, days must borrow.
  it('does not over-count months the day before a monthly rollover', () => {
    // Sep 2 -> Oct 1: not yet one month; Sep has 30 days so 29 days elapsed.
    expect(calendarDiff(d(2022, 9, 2), d(2022, 10, 1))).toMatchObject({
      years: 0,
      months: 0,
      days: 29,
    })
  })

  it('borrows days using the correct (variable) month length', () => {
    // Jan 15 -> Mar 14: 1 month (Jan15->Feb15) + 27 days (Feb15->Mar14, Feb 2023 = 28 days)
    expect(calendarDiff(d(2023, 1, 15), d(2023, 3, 14))).toMatchObject({
      years: 0,
      months: 1,
      days: 27,
    })
  })

  it('handles leap day', () => {
    // Feb 29 2020 -> Feb 28 2021: just short of a year
    const diff = calendarDiff(d(2020, 2, 29), d(2021, 2, 28))
    expect(diff.years).toBe(0)
    expect(diff.months).toBe(11)
    expect(diff.days).toBe(30)
  })

  it('crosses a year boundary (Dec -> Jan)', () => {
    expect(calendarDiff(d(2022, 12, 25), d(2023, 1, 5))).toMatchObject({
      years: 0,
      months: 0,
      days: 11,
    })
  })

  it('computes a multi-year span', () => {
    expect(calendarDiff(d(2020, 1, 1, 0, 0, 0), d(2023, 6, 15, 5, 30, 10))).toMatchObject({
      years: 3,
      months: 5,
      days: 14,
      hours: 5,
      minutes: 30,
      seconds: 10,
    })
  })

  it('returns the magnitude when to is before from', () => {
    const a = d(2022, 9, 2, 11, 7, 22)
    const b = d(2023, 9, 2, 11, 7, 22)
    expect(calendarDiff(b, a)).toEqual(calendarDiff(a, b))
  })
})

describe('formatCalendar', () => {
  it('omits leading zero units and pluralizes correctly', () => {
    expect(formatCalendar({ years: 1, months: 0, days: 4, hours: 1, minutes: 6, seconds: 55 })).toEqual({
      main: '1 Year 4 Days',
      remainder: '1 Hour 6 Minutes 55 Seconds',
    })
  })

  it('shows singular vs plural units', () => {
    expect(formatCalendar({ years: 2, months: 1, days: 1, hours: 0, minutes: 1, seconds: 0 }).main).toBe(
      '2 Years 1 Month 1 Day',
    )
  })

  it('falls back to 0 Days when nothing larger than an hour has elapsed', () => {
    expect(formatCalendar({ years: 0, months: 0, days: 0, hours: 5, minutes: 0, seconds: 0 }).main).toBe(
      '0 Days',
    )
  })
})

describe('future-time calculator', () => {
  it('maps units to milliseconds', () => {
    expect(unitToMs('Seconds')).toBe(SECOND)
    expect(unitToMs('Weeks')).toBe(WEEK)
    expect(unitToMs('nonsense')).toBe(0)
  })

  it('adds a whole number of units to a base date', () => {
    const base = d(2022, 9, 2, 11, 7, 22)
    expect(addToDate(base, 3, 'Days').getTime()).toBe(base.getTime() + 3 * DAY)
    expect(addToDate(base, 2, 'Weeks').getTime()).toBe(base.getTime() + 2 * WEEK)
  })
})
