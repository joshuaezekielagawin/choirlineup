import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import themePlugin from '@fullcalendar/react/themes/breezy'
import dayGridPlugin from '@fullcalendar/react/daygrid'
import timeGridPlugin from '@fullcalendar/react/timegrid'
import listPlugin from '@fullcalendar/react/list'
import interactionPlugin from '@fullcalendar/react/interaction'
import type { EventClickInfo, EventInput } from '@fullcalendar/react'
import { CalendarDays, Check, CircleAlert } from 'lucide-react'
import { api, type ChoirEvent } from './api'
import '@fullcalendar/react/skeleton.css'
import '@fullcalendar/react/themes/breezy/theme.css'
import '@fullcalendar/react/themes/breezy/palettes/emerald.css'

type CalendarItemKind = 'event' | 'deadline' | 'practice'
type CalendarItem = EventInput & { extendedProps: { kind: CalendarItemKind; eventId: number; readyCount: number; lineupCount: number; choirName: string; incompleteCount: number; firstIncompleteIndex: number } }

export function createCalendarItems(events: ChoirEvent[]): CalendarItem[] {
  const items: CalendarItem[] = []
  for (const event of events) {
    const active = event.status === 'upcoming' || event.status === 'preparing'
    const incomplete = event.lineup.filter(entry => entry.preparation_status !== 'ready')
    const props = { eventId: event.id, readyCount: event.ready_count, lineupCount: event.lineup_count, choirName: event.choir.name }
    items.push({
      id: `event-${event.id}`, title: event.title, start: `${event.date}T${event.start_time}`, end: `${event.date}T${event.end_time}`,
      backgroundColor: event.choir.color, borderColor: event.choir.color, textColor: readableTextColor(event.choir.color),
      extendedProps: { ...props, kind: 'event', incompleteCount: incomplete.length, firstIncompleteIndex: Math.max(0, event.lineup.findIndex(entry => entry.preparation_status !== 'ready')) },
    })
    if (active && event.preparation_deadline) items.push({
      id: `deadline-${event.id}`, title: `Preparation deadline · ${event.title}`, start: event.preparation_deadline, allDay: true,
      backgroundColor: '#efe7d4', borderColor: '#c7a765', textColor: '#6c5528',
      classNames: ['calendar-marker-deadline'],
      extendedProps: { ...props, kind: 'deadline', incompleteCount: incomplete.length, firstIncompleteIndex: Math.max(0, event.lineup.findIndex(entry => entry.preparation_status !== 'ready')) },
    })
    if (active && incomplete.length) items.push({
      id: `practice-${event.id}`, title: `Practice ${incomplete.length} ${incomplete.length === 1 ? 'song' : 'songs'} · ${event.title}`, start: event.preparation_deadline || event.date, allDay: true,
      backgroundColor: '#e7eee6', borderColor: event.choir.color, textColor: '#344b3e',
      classNames: ['calendar-marker-practice'],
      extendedProps: { ...props, kind: 'practice', incompleteCount: incomplete.length, firstIncompleteIndex: Math.max(0, event.lineup.findIndex(entry => entry.preparation_status !== 'ready')) },
    })
  }
  return items
}

export function calendarFirstDay(weekStart: string) { return weekStart === 'monday' ? 1 : 0 }

export function readableTextColor(hexColor: string) {
  const match = /^#([0-9a-f]{6})$/i.exec(hexColor)
  if (!match) return '#ffffff'
  const rgb = [0, 2, 4].map(index => Number.parseInt(match[1].slice(index, index + 2), 16) / 255)
  const luminance = rgb.map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)
  return luminance > .43 ? '#26352a' : '#ffffff'
}

export function CalendarPage({ weekStart, choirs }: { weekStart: string; choirs: { id: number; name: string; color: string }[] }) {
  const [events, setEvents] = useState<ChoirEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [choirFilter, setChoirFilter] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    let active = true
    api.get<ChoirEvent[]>('/events/').then(({ data }) => { if (active) setEvents(data) }).catch(() => { if (active) setError('Calendar events could not be loaded. Check your connection and retry.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const filteredEvents = useMemo(() => events.filter(event => !choirFilter || String(event.choir.id) === choirFilter), [events, choirFilter])
  const calendarItems = useMemo(() => createCalendarItems(filteredEvents), [filteredEvents])
  function openCalendarItem(info: EventClickInfo) {
    info.jsEvent.preventDefault()
    const item = info.event.extendedProps
    if (item.kind === 'practice') navigate(`/practice/${item.eventId}/${item.firstIncompleteIndex}`)
    else navigate(`/events/${item.eventId}`)
  }
  return <div className="page-stack calendar-page">
    <div className="page-intro-row"><div><p className="eyebrow">YOUR REHEARSALS & PREPARATION</p><h2>Calendar</h2><p className="muted">Events, deadlines, and songs to practice, all in one view.</p></div><label className="calendar-filter">Choir<select aria-label="Filter calendar by choir" value={choirFilter} onChange={event => setChoirFilter(event.target.value)}><option value="">All choirs</option>{choirs.map(choir => <option key={choir.id} value={choir.id}>{choir.name}</option>)}</select></label></div>
    {error && <div className="inline-error" role="alert">{error}<button onClick={() => { setError(''); setLoading(true); api.get<ChoirEvent[]>('/events/').then(({ data }) => setEvents(data)).catch(() => setError('Calendar events could not be loaded. Check your connection and retry.')).finally(() => setLoading(false)) }}>Retry</button></div>}
    <section className="calendar-shell" aria-label="Choir events calendar">
      <div className="calendar-legend"><span><i className="calendar-legend-choir" /> Events use their choir color</span><span><i className="calendar-legend-deadline" /> Preparation deadline</span><span><i className="calendar-legend-practice" /> Songs to practice</span></div>
      {loading ? <div className="calendar-loading"><CalendarDays size={20} /> Loading your calendar…</div> : <FullCalendar
        plugins={[themePlugin, dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay,listMonth' }}
        buttons={{
          dayGridMonth: { text: 'Month' },
          timeGridWeek: { text: 'Week' },
          timeGridDay: { text: 'Day' },
          listMonth: { text: 'Agenda' },
        }}
        firstDay={calendarFirstDay(weekStart)}
        events={calendarItems}
        eventClick={openCalendarItem}
        eventContent={renderCalendarEvent}
        height="auto"
        dayMaxEvents={3}
        nowIndicator
        fixedWeekCount={false}
        eventDisplay="block"
        noEventsContent="No events in this date range"
        longPressDelay={350}
      />}
    </section>
    {!loading && !filteredEvents.length && <section className="calendar-empty-hint"><span className="empty-icon"><CalendarDays size={20} /></span><div><strong>Your calendar is ready for a date.</strong><p>Create an event and it will appear here with its choir color and preparation details.</p></div><Link className="button-secondary" to="/events">Go to events</Link></section>}
    {!loading && filteredEvents.length > 0 && <section className="calendar-reminder-note"><CircleAlert size={16} /><p>Practice reminders are shown on each event’s preparation deadline. Events without a deadline show their reminder on the event date.</p><span><Check size={14} /> Week starts {weekStart}</span></section>}
  </div>
}

function renderCalendarEvent(info: any) {
  const { kind, readyCount, lineupCount, incompleteCount, choirName } = info.event.extendedProps
  return <div className={`calendar-event-content calendar-event-${kind}`} title={`${info.event.title} · ${choirName}`}><strong>{info.event.title}</strong>{kind === 'event' ? <small>{readyCount}/{lineupCount} ready</small> : <small>{kind === 'deadline' ? 'Preparation deadline' : `${incompleteCount} to practice`}</small>}</div>
}
