import { describe, expect, it } from 'vitest'
import { calendarFirstDay, createCalendarItems, readableTextColor } from './CalendarPage'
import type { ChoirEvent } from './api'

const event: ChoirEvent = {
  id: 9, title: 'Winter Concert', choir: { id: 4, name: 'North Choir', color: '#728b72' }, date: '2026-12-19', start_time: '19:30:00', end_time: '21:00:00', venue: 'Hall', description: '', preparation_deadline: '2026-12-12', status: 'preparing', lineup_count: 2, ready_count: 1, created_at: '', updated_at: '',
  lineup: [
    { id: 1, song: { id: 10, title: 'Ready song', composer_artist: '' }, position: 1, purpose: 'opening', assigned_voice_part: '', special_instructions: '', practice_notes: '', preparation_status: 'ready' },
    { id: 2, song: { id: 11, title: 'Learning song', composer_artist: '' }, position: 2, purpose: 'closing', assigned_voice_part: '', special_instructions: '', practice_notes: '', preparation_status: 'learning' },
  ],
}

describe('calendar data', () => {
  it('maps events, preparation deadlines, and incomplete practice reminders with choir colors', () => {
    const items = createCalendarItems([event])
    expect(items).toHaveLength(3)
    expect(items[0]).toMatchObject({ id: 'event-9', title: 'Winter Concert', start: '2026-12-19T19:30:00', backgroundColor: '#728b72' })
    expect(items[1]).toMatchObject({ id: 'deadline-9', start: '2026-12-12', allDay: true, extendedProps: { kind: 'deadline' } })
    expect(items[2]).toMatchObject({ id: 'practice-9', title: 'Practice 1 song · Winter Concert', extendedProps: { kind: 'practice', incompleteCount: 1, firstIncompleteIndex: 1 } })
  })

  it('does not create preparation reminders for completed events and respects week start', () => {
    expect(createCalendarItems([{ ...event, status: 'completed' }])).toHaveLength(1)
    expect(calendarFirstDay('monday')).toBe(1)
    expect(calendarFirstDay('sunday')).toBe(0)
    expect(readableTextColor('#f1ead5')).toBe('#26352a')
    expect(readableTextColor('#263f35')).toBe('#ffffff')
  })
})
