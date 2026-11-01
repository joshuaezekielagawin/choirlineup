import { useEffect, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronUp, Clock3, GripVertical, MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { api, type Choir, type ChoirEvent, type EventLineupItem, type Song } from './api'

const eventStatuses = ['upcoming', 'preparing', 'completed', 'cancelled'] as const
const preparationStatuses = ['not_started', 'learning', 'practiced', 'ready'] as const
const purposes = ['opening', 'worship', 'communion', 'closing', 'special_music', 'other'] as const
type EventFields = { title: string; choir_id: number; date: string; start_time: string; end_time: string; venue: string; description: string; preparation_deadline: string; status: ChoirEvent['status'] }
type LineupFields = Pick<EventLineupItem, 'purpose' | 'assigned_voice_part' | 'special_instructions' | 'practice_notes' | 'preparation_status'>

export function EventsPage({ choirs }: { choirs: Choir[] }) {
  return <Routes><Route index element={<EventListPage choirs={choirs} />} /><Route path=":eventId" element={<EventDetailPage choirs={choirs} />} /></Routes>
}

function EventListPage({ choirs }: { choirs: Choir[] }) {
  const [events, setEvents] = useState<ChoirEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('active')
  const [choirFilter, setChoirFilter] = useState('')
  const [editing, setEditing] = useState<ChoirEvent | 'new' | null>(null)
  const [notice, setNotice] = useState('')
  const navigate = useNavigate()
  async function loadEvents() {
    setLoading(true); setError('')
    try { const { data } = await api.get<ChoirEvent[]>('/events/'); setEvents(data) }
    catch { setError('Events could not be loaded. Check your connection and try again.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadEvents() }, [])
  const visibleEvents = events.filter(event => {
    const statusMatches = filter === 'all' || (filter === 'active' ? ['upcoming', 'preparing'].includes(event.status) : event.status === filter)
    return statusMatches && (!choirFilter || String(event.choir.id) === choirFilter)
  })
  async function saveEvent(values: EventFields, event?: ChoirEvent) {
    setError(''); setNotice('')
    const payload = { ...values, preparation_deadline: values.preparation_deadline || null }
    try {
      const { data } = event ? await api.patch<ChoirEvent>(`/events/${event.id}/`, payload) : await api.post<ChoirEvent>('/events/', payload)
      await loadEvents(); setEditing(null); setNotice(event ? 'Event details updated.' : 'Event created.'); if (!event) navigate(`/events/${data.id}`)
    } catch (e) { setError(apiError(e, 'The event could not be saved. Check the dates and times.')) }
  }
  async function removeEvent(event: ChoirEvent) {
    if (!window.confirm(`Delete “${event.title}” and its lineup? The songs and learning materials in your library will remain.`)) return
    try { await api.delete(`/events/${event.id}/`); await loadEvents(); setNotice('Event deleted.') }
    catch { setError('The event could not be deleted.') }
  }
  const activeCount = events.filter(event => ['upcoming', 'preparing'].includes(event.status)).length
  return <div className="page-stack events-page">
    <div className="page-intro-row"><div><p className="eyebrow">YOUR REHEARSALS & PERFORMANCES</p><h2>Events <span className="count-pill">{loading ? '…' : activeCount}</span></h2><p className="muted">Plan each choir event and arrange the songs you’ll sing.</p></div><button className="button-primary" onClick={() => setEditing('new')} disabled={!choirs.length}><Plus size={16} /> Add event</button></div>
    {!choirs.length && <div className="inline-error">Create a choir before adding an event. <Link to="/choirs">Go to My choirs</Link></div>}
    {(notice || error) && <div className={error ? 'inline-error' : 'success-banner'} role={error ? 'alert' : 'status'}>{error || notice}<button aria-label="Dismiss" onClick={() => { setError(''); setNotice('') }}>×</button></div>}
    <div className="event-list-controls"><div className="event-tabs" role="tablist" aria-label="Filter events">{[['active', 'Upcoming'], ['all', 'All'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([value, label]) => <button role="tab" aria-selected={filter === value} className={filter === value ? 'selected' : ''} key={value} onClick={() => setFilter(value)}>{label}</button>)}</div><select aria-label="Filter events by choir" value={choirFilter} onChange={event => setChoirFilter(event.target.value)}><option value="">All choirs</option>{choirs.map(choir => <option value={choir.id} key={choir.id}>{choir.name}</option>)}</select></div>
    {loading ? <div className="event-list">{[0, 1].map(item => <div className="skeleton-row" key={item} />)}</div> : visibleEvents.length ? <div className="event-list">{visibleEvents.map(event => <article className="event-card" key={event.id}>
      <div className="event-date-tile"><span>{new Intl.DateTimeFormat(undefined, { month: 'short' }).format(new Date(`${event.date}T12:00:00`))}</span><strong>{new Intl.DateTimeFormat(undefined, { day: '2-digit' }).format(new Date(`${event.date}T12:00:00`))}</strong><small>{new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(`${event.date}T12:00:00`))}</small></div>
      <button className="event-card-main" onClick={() => navigate(`/events/${event.id}`)}><span className="event-card-heading"><strong>{event.title}</strong><span className={`event-status status-${event.status}`}>{labelCase(event.status)}</span></span><span className="event-meta"><i style={{ backgroundColor: event.choir.color }} />{event.choir.name}<span>·</span><Clock3 size={12} />{formatTime(event.start_time)} – {formatTime(event.end_time)}</span><span className="event-meta">{event.venue ? <><MapPin size={12} />{event.venue}</> : 'Venue not set'}</span><span className="event-progress"><span className="progress-track"><i style={{ width: `${event.lineup_count ? Math.round(event.ready_count / event.lineup_count * 100) : 0}%` }} /></span><small>{event.ready_count}/{event.lineup_count} songs ready</small></span></button>
      <div className="event-card-actions"><button className="icon-button" aria-label={`Edit ${event.title}`} onClick={() => setEditing(event)}><Pencil size={15} /></button><button className="icon-button event-delete" aria-label={`Delete ${event.title}`} onClick={() => void removeEvent(event)}><Trash2 size={15} /></button></div>
    </article>)}</div> : <section className="large-empty"><span className="empty-icon"><CalendarDays size={22} /></span><h3>{events.length ? 'No events in this view' : 'Your calendar starts with an event'}</h3><p>{events.length ? 'Try another event status or choir filter.' : 'Create a choir event, then build the ordered list of songs you’ll sing.'}</p>{!events.length && choirs.length > 0 && <button className="button-primary" onClick={() => setEditing('new')}><Plus size={15} /> Add your first event</button>}</section>}
    {editing && <EventEditor key={editing === 'new' ? 'new-event' : editing.id} event={editing === 'new' ? null : editing} choirs={choirs} onClose={() => setEditing(null)} onSave={values => void saveEvent(values, editing === 'new' ? undefined : editing)} />}
  </div>
}

function EventEditor({ event, choirs, onClose, onSave }: { event: ChoirEvent | null; choirs: Choir[]; onClose: () => void; onSave: (values: EventFields) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<EventFields>({ defaultValues: event ? {
    title: event.title, choir_id: event.choir.id, date: event.date, start_time: event.start_time.slice(0, 5), end_time: event.end_time.slice(0, 5),
    venue: event.venue, description: event.description, preparation_deadline: event.preparation_deadline || '', status: event.status,
  } : { choir_id: choirs[0]?.id || 0, date: localDate(), start_time: '19:00', end_time: '20:30', status: 'upcoming', preparation_deadline: '' } })
  return <div className="modal-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card event-editor" role="dialog" aria-modal="true" aria-labelledby="event-editor-title"><div className="modal-header"><div><p className="eyebrow">PLAN YOUR PERFORMANCE</p><h3 id="event-editor-title">{event ? 'Edit event' : 'Add an event'}</h3></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
    <form className="modal-form" onSubmit={handleSubmit(onSave)}>
      <label>Event title<input autoFocus placeholder="e.g. Spring Concert" {...register('title', { required: 'Enter an event title.', maxLength: 180 })} />{errors.title && <small className="field-error">{errors.title.message}</small>}</label>
      <label>Choir<select {...register('choir_id', { required: true, valueAsNumber: true })}>{choirs.map(choir => <option key={choir.id} value={choir.id}>{choir.name}</option>)}</select></label>
      <div className="event-form-grid"><label>Date<input type="date" {...register('date', { required: 'Choose an event date.' })} /></label><label>Status<select {...register('status', { required: true })}>{eventStatuses.map(status => <option value={status} key={status}>{labelCase(status)}</option>)}</select></label></div>
      <div className="event-form-grid"><label>Start time<input type="time" {...register('start_time', { required: 'Set a start time.' })} /></label><label>End time<input type="time" {...register('end_time', { required: 'Set an end time.' })} /></label></div>
      <label>Venue <span className="optional">Optional</span><input placeholder="Where you’ll sing" {...register('venue', { maxLength: 180 })} /></label>
      <label>Preparation deadline <span className="optional">Optional</span><input type="date" {...register('preparation_deadline')} /></label>
      <label>Description <span className="optional">Optional</span><textarea rows={3} placeholder="Anything you want to remember about this event" {...register('description')} /></label>
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={isSubmitting}>{event ? 'Save changes' : 'Create event'}</button></div>
    </form>
  </section></div>
}

function EventDetailPage({ choirs }: { choirs: Choir[] }) {
  const { eventId = '' } = useParams()
  const [event, setEvent] = useState<ChoirEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [savingOrder, setSavingOrder] = useState(false)
  const [orderNotice, setOrderNotice] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  async function loadEvent() {
    setError(''); setLoading(true)
    try { const { data } = await api.get<ChoirEvent>(`/events/${eventId}/`); setEvent(data) }
    catch { setError('This event could not be loaded. It may have been deleted or is not available to this account.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void loadEvent() }, [eventId])
  async function saveEvent(values: EventFields) {
    if (!event) return
    try { const { data } = await api.patch<ChoirEvent>(`/events/${event.id}/`, { ...values, preparation_deadline: values.preparation_deadline || null }); setEvent(data); setEditing(false) }
    catch (e) { setError(apiError(e, 'The event details could not be saved.')) }
  }
  async function deleteEntry(entry: EventLineupItem) {
    if (!event || !window.confirm(`Remove “${entry.song.title}” from this event? The song remains in your library.`)) return
    try { await api.delete(`/lineup-items/${entry.id}/`); await loadEvent() }
    catch { setError('The song could not be removed from this lineup.') }
  }
  async function saveLineupEntry(entryId: number, fields: LineupFields) {
    try {
      const { data } = await api.patch<EventLineupItem>(`/lineup-items/${entryId}/`, fields)
      setEvent(current => current ? { ...current, lineup: current.lineup.map(entry => entry.id === entryId ? data : entry) } : current)
      return true
    } catch (e) { setError(apiError(e, 'Lineup details could not be saved.')); return false }
  }
  async function reorder(eventInfo: DragEndEvent) {
    if (!event || savingOrder || !eventInfo.over || eventInfo.active.id === eventInfo.over.id) return
    const previous = event.lineup
    const from = previous.findIndex(entry => entry.id === eventInfo.active.id)
    const to = previous.findIndex(entry => entry.id === eventInfo.over?.id)
    if (from < 0 || to < 0) return
    const optimistic = arrayMove(previous, from, to).map((entry, index) => ({ ...entry, position: index + 1 }))
    setEvent({ ...event, lineup: optimistic }); setSavingOrder(true); setOrderNotice('Saving order…'); setError('')
    try {
      const { data } = await api.post<EventLineupItem[]>(`/events/${event.id}/reorder-lineup/`, { event_song_ids: optimistic.map(entry => entry.id) })
      setEvent(current => current ? { ...current, lineup: data, updated_at: new Date().toISOString() } : current)
      setOrderNotice('Order saved.')
    } catch (e) {
      setEvent(current => current ? { ...current, lineup: previous } : current)
      setOrderNotice('')
      setError(apiError(e, 'The new order could not be saved. Your previous order has been restored.'))
    } finally { setSavingOrder(false) }
  }
  if (loading) return <div className="page-stack"><div className="skeleton-row" /><div className="skeleton-row" /></div>
  if (!event) return <div className="page-stack"><Link to="/events" className="subtle-link"><ArrowLeft size={14} /> Back to events</Link><div className="inline-error" role="alert">{error || 'Event not found.'}</div></div>
  const progress = event.lineup.length ? Math.round(event.lineup.filter(entry => entry.preparation_status === 'ready').length / event.lineup.length * 100) : 0
  return <div className="page-stack event-detail-page">
    <Link to="/events" className="back-link"><ArrowLeft size={14} /> All events</Link>
    {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
    <section className="event-detail-hero"><div className="event-detail-color" style={{ backgroundColor: event.choir.color }} /><div className="event-detail-head"><p className="eyebrow">{event.choir.name}</p><div className="event-detail-title-row"><h2>{event.title}</h2><span className={`event-status status-${event.status}`}>{labelCase(event.status)}</span></div><div className="event-detail-meta"><span><CalendarDays size={15} />{formatDate(event.date)}</span><span><Clock3 size={15} />{formatTime(event.start_time)} – {formatTime(event.end_time)}</span>{event.venue && <span><MapPin size={15} />{event.venue}</span>}</div>{event.preparation_deadline && <p className="deadline-note">Preparation deadline · {formatDate(event.preparation_deadline)}</p>}</div><div className="event-detail-actions"><Link className="button-primary" to={`/practice/${event.id}/0`}>Practice lineup</Link><button className="button-secondary event-edit-button" onClick={() => setEditing(true)}><Pencil size={14} /> Edit event</button></div></section>
    {event.description && <section className="content-card event-description-card"><p className="eyebrow">EVENT NOTES</p><p>{event.description}</p></section>}
    <section className="lineup-panel"><header className="lineup-panel-header"><div><p className="eyebrow">PERFORMANCE ORDER</p><h3>Song lineup <span>{event.lineup.length}</span></h3><p className="muted">Drag songs into order. Changes save automatically.</p></div><button className="button-primary" onClick={() => setAddOpen(true)}><Plus size={15} /> Add song</button></header>
      <div className="lineup-progress-row"><div className="lineup-progress-label"><span>Preparation progress</span><strong>{progress}% ready</strong></div><span className="lineup-progress-track"><i style={{ width: `${progress}%` }} /></span></div>
      {orderNotice && <div className="lineup-save-state" role="status">{savingOrder && <span className="saving-spinner" />}{!savingOrder && orderNotice === 'Order saved.' && <Check size={13} />}{orderNotice}</div>}
      {event.lineup.length ? <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorder}><SortableContext items={event.lineup.map(entry => entry.id)} strategy={verticalListSortingStrategy}><div className="event-lineup">{event.lineup.map((entry, index) => <SortableLineupRow key={entry.id} entry={entry} position={index + 1} expanded={expandedId === entry.id} onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)} onDelete={() => void deleteEntry(entry)} onSave={fields => saveLineupEntry(entry.id, fields)} />)}</div></SortableContext></DndContext> : <div className="lineup-empty"><Music2Icon /><div><strong>No songs in the lineup yet</strong><p>Add songs from your library or create one for this event.</p></div></div>}
    </section>
    {editing && <EventEditor key={event.id} event={event} choirs={choirs} onClose={() => setEditing(false)} onSave={values => void saveEvent(values)} />}
    {addOpen && <AddLineupSong event={event} onClose={() => setAddOpen(false)} onAdded={() => { setAddOpen(false); void loadEvent() }} />}
  </div>
}

function SortableLineupRow({ entry, position, expanded, onToggle, onDelete, onSave }: { entry: EventLineupItem; position: number; expanded: boolean; onToggle: () => void; onDelete: () => void; onSave: (fields: LineupFields) => Promise<boolean> }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: entry.id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.55 : 1 }
  return <article ref={setNodeRef} style={style} className={`lineup-row ${expanded ? 'lineup-row-expanded' : ''}`}>
    <button className="lineup-drag-handle" aria-label={`Reorder ${entry.song.title}`} {...attributes} {...listeners}><GripVertical size={17} /></button>
    <span className="lineup-position">{position.toString().padStart(2, '0')}</span>
    <button className="lineup-song-main" onClick={onToggle} aria-expanded={expanded}><strong>{entry.song.title}</strong><small>{entry.song.composer_artist || 'Composer or artist not added'}{entry.purpose !== 'other' ? ` · ${labelCase(entry.purpose)}` : ''}</small></button>
    <span className={`preparation-badge prep-${entry.preparation_status}`}>{labelCase(entry.preparation_status.replace('_', ' '))}</span>
    <button className="icon-button lineup-expand" aria-label={expanded ? 'Collapse song details' : 'Expand song details'} onClick={onToggle}>{expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</button>
    {expanded && <LineupEntryEditor key={`${entry.id}-${entry.preparation_status}`} entry={entry} onDelete={onDelete} onSave={onSave} />}
  </article>
}

function LineupEntryEditor({ entry, onDelete, onSave }: { entry: EventLineupItem; onDelete: () => void; onSave: (fields: LineupFields) => Promise<boolean> }) {
  const { register, handleSubmit, formState: { isSubmitting, isDirty } } = useForm<LineupFields>({ defaultValues: {
    purpose: entry.purpose, assigned_voice_part: entry.assigned_voice_part, special_instructions: entry.special_instructions,
    practice_notes: entry.practice_notes, preparation_status: entry.preparation_status,
  } })
  const [saved, setSaved] = useState(false)
  async function submit(values: LineupFields) { setSaved(false); if (await onSave(values)) setSaved(true) }
  return <form className="lineup-entry-form" onSubmit={handleSubmit(submit)}>
    <div className="lineup-entry-grid"><label>Song purpose<select {...register('purpose')}>{purposes.map(value => <option value={value} key={value}>{purposeLabel(value)}</option>)}</select></label><label>Assigned voice part<input placeholder="e.g. Tenor 1" {...register('assigned_voice_part', { maxLength: 60 })} /></label><label>Preparation status<select {...register('preparation_status')}>{preparationStatuses.map(value => <option value={value} key={value}>{labelCase(value.replace('_', ' '))}</option>)}</select></label></div>
    <label>Special instructions<textarea rows={2} placeholder="Notes specific to this event" {...register('special_instructions')} /></label>
    <label>Personal practice notes<textarea rows={2} placeholder="Your own notes for this song" {...register('practice_notes')} /></label>
    <div className="lineup-entry-actions"><button type="button" className="button-danger-quiet" onClick={onDelete}><Trash2 size={13} /> Remove from event</button><span className="entry-saved" role="status">{saved ? 'Saved' : ''}</span><button className="button-primary" disabled={isSubmitting || !isDirty}>{isSubmitting ? 'Saving…' : 'Save details'}</button></div>
  </form>
}

function AddLineupSong({ event, onClose, onAdded }: { event: ChoirEvent; onClose: () => void; onAdded: () => void }) {
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const [savingId, setSavingId] = useState<number | null>(null)
  const { register, handleSubmit, formState: { isSubmitting } } = useForm<Pick<Song, 'title' | 'composer_artist' | 'language' | 'musical_key' | 'description'>>()
  useEffect(() => { api.get<Song[]>('/songs/').then(({ data }) => setSongs(data)).catch(() => setError('Your song library could not be loaded.')).finally(() => setLoading(false)) }, [])
  const existingIds = new Set(event.lineup.map(entry => entry.song.id))
  const filtered = songs.filter(song => song.title.toLowerCase().includes(query.toLowerCase()))
  async function add(songId: number) {
    setError(''); setSavingId(songId)
    try { await api.post(`/events/${event.id}/lineup/`, { song_id: songId }); onAdded() }
    catch (e) { setError(apiError(e, 'This song could not be added. It may already be in the lineup.')) }
    finally { setSavingId(null) }
  }
  async function createSong(values: Pick<Song, 'title' | 'composer_artist' | 'language' | 'musical_key' | 'description'>) {
    setError('')
    try {
      const { data } = await api.post<Song>('/songs/', { ...values, choir_ids: [event.choir.id], category_ids: [] })
      await api.post(`/events/${event.id}/lineup/`, { song_id: data.id })
      onAdded()
    } catch (e) { setError(apiError(e, 'The song could not be created and added. If the song saved, it remains in your library.')) }
  }
  return <div className="modal-scrim" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}><section className="modal-card add-lineup-modal" role="dialog" aria-modal="true" aria-labelledby="add-lineup-title"><div className="modal-header"><div><p className="eyebrow">{event.title}</p><h3 id="add-lineup-title">Add a song</h3></div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></div>
    <div className="add-song-tabs"><button className={!creating ? 'selected' : ''} onClick={() => setCreating(false)}>From your library</button><button className={creating ? 'selected' : ''} onClick={() => setCreating(true)}>Create new song</button></div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {!creating ? <div className="song-picker"><input aria-label="Search your songs" placeholder="Search song titles" value={query} onChange={e => setQuery(e.target.value)} />{loading ? <p className="muted">Loading songs…</p> : filtered.length ? filtered.map(song => <div className="song-picker-row" key={song.id}><span><strong>{song.title}</strong><small>{song.composer_artist || 'Composer or artist not added'}</small></span><button className="button-secondary" disabled={existingIds.has(song.id) || savingId === song.id} onClick={() => void add(song.id)}>{existingIds.has(song.id) ? 'Added' : savingId === song.id ? 'Adding…' : 'Add'}</button></div>) : <p className="muted">No songs found. Create a new song for this event.</p>}</div> : <form className="modal-form create-event-song" onSubmit={handleSubmit(values => void createSong(values))}><p className="form-note">This creates one reusable song in your library and assigns it to {event.choir.name}.</p><label>Song title<input autoFocus {...register('title', { required: true })} /></label><label>Composer or artist<input {...register('composer_artist')} /></label><div className="event-form-grid"><label>Language<input {...register('language')} /></label><label>Musical key<input {...register('musical_key')} /></label></div><label>Description<textarea rows={2} {...register('description')} /></label><div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create and add song'}</button></div></form>}
  </section></div>
}

function Music2Icon() { return <span className="lineup-empty-note">♫</span> }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function formatTime(value: string) { const [hours, minutes] = value.split(':'); return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2000, 0, 1, Number(hours), Number(minutes))) }
function localDate() { const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 10) }
function purposeLabel(value: string) { return value === 'special_music' ? 'Special Music' : labelCase(value) }
function labelCase(value: string) { return value ? value[0].toUpperCase() + value.slice(1) : '' }
function apiError(error: any, fallback: string) {
  const detail = error.response?.data
  if (typeof detail === 'string') return detail
  return Object.values(detail || {}).flat().filter(value => typeof value === 'string').join(' ') || fallback
}
