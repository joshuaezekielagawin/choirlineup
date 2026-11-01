import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowLeft, Check, ChevronLeft, ChevronRight, GripVertical, Music2, Play, RotateCcw } from 'lucide-react'
import { api, type ChoirEvent, type EventLineupItem, type SongAttachment } from './api'

const prepStatuses: EventLineupItem['preparation_status'][] = ['not_started', 'learning', 'practiced', 'ready']

export function PracticePage() {
  return <Routes><Route index element={<PracticeHome />} /><Route path=":eventId/:index" element={<PracticeSession />} /><Route path="*" element={<PracticeHome />} /></Routes>
}

function PracticeHome() {
  const [events, setEvents] = useState<ChoirEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => { api.get<ChoirEvent[]>('/events/').then(({ data }) => setEvents(data.filter(event => ['upcoming', 'preparing'].includes(event.status)))).catch(() => setError('Events could not be loaded.')).finally(() => setLoading(false)) }, [])
  return <div className="page-stack practice-home"><div><p className="eyebrow">A LITTLE PRACTICE GOES A LONG WAY</p><h2>Practice</h2><p className="muted">Choose an event to work through its songs in performance order.</p></div>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {loading ? <div className="skeleton-row" /> : events.length ? <div className="practice-event-list">{events.map(event => <Link className="practice-event-card" to={`/practice/${event.id}/0`} key={event.id}><span className="practice-event-color" style={{ backgroundColor: event.choir.color }} /><span className="practice-event-copy"><small>{event.choir.name} · {formatDate(event.date)}</small><strong>{event.title}</strong><span>{event.lineup.length} {event.lineup.length === 1 ? 'song' : 'songs'} · {event.ready_count} ready</span></span><span className="card-arrow"><Play size={16} /></span></Link>)}</div> : <section className="large-empty"><span className="empty-icon"><Music2 size={22} /></span><h3>No active events to practice</h3><p>Add an upcoming or preparing event and its lineup will be ready here.</p><Link className="button-primary" to="/events">Go to events</Link></section>}
  </div>
}

function PracticeSession() {
  const { eventId = '', index: indexText = '0' } = useParams()
  const navigate = useNavigate()
  const index = Math.max(0, Number.parseInt(indexText, 10) || 0)
  const [event, setEvent] = useState<ChoirEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [autoNext, setAutoNext] = useState(localStorage.getItem('choirlineup-practice-auto-next') === 'true')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setLoading(true); api.get<ChoirEvent>(`/events/${eventId}/`).then(({ data }) => setEvent(data)).catch(() => setError('This event is not available.')).finally(() => setLoading(false)) }, [eventId])
  useEffect(() => { localStorage.setItem('choirlineup-practice-auto-next', String(autoNext)) }, [autoNext])
  const clampedIndex = event?.lineup.length ? Math.min(index, event.lineup.length - 1) : 0
  const current = event?.lineup[clampedIndex]
  async function updateStatus(value: EventLineupItem['preparation_status']) {
    if (!event || !current) return
    setSaving(true); setError('')
    try {
      const { data } = await api.patch<EventLineupItem>(`/lineup-items/${current.id}/`, { preparation_status: value })
      setEvent(existing => existing ? { ...existing, lineup: existing.lineup.map(item => item.id === data.id ? data : item), ready_count: existing.lineup.filter(item => item.id === data.id ? data.preparation_status === 'ready' : item.preparation_status === 'ready').length } : existing)
      if (value === 'ready' && autoNext && clampedIndex < event.lineup.length - 1) navigate(`/practice/${event.id}/${clampedIndex + 1}`)
    } catch { setError('Preparation status could not be saved. Try again.') }
    finally { setSaving(false) }
  }
  if (loading) return <div className="page-stack"><div className="skeleton-row" /><div className="skeleton-row" /></div>
  if (!event) return <div className="page-stack"><Link className="back-link" to="/practice"><ArrowLeft size={14} /> Practice</Link><div className="inline-error" role="alert">{error || 'Event not found.'}</div></div>
  if (!event.lineup.length) return <div className="page-stack"><Link className="back-link" to={`/events/${event.id}`}><ArrowLeft size={14} /> Event lineup</Link><div className="large-empty"><Music2 size={22} /><h3>This lineup has no songs</h3><p>Add songs to the event before starting practice.</p></div></div>
  return <div className="page-stack practice-session">
    <div className="practice-topline"><Link className="back-link" to={`/events/${event.id}`}><ArrowLeft size={14} /> Return to lineup</Link><label className="auto-next-setting"><input type="checkbox" checked={autoNext} onChange={e => setAutoNext(e.target.checked)} /> Move to next song when marked Ready</label></div>
    {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
    <section className="practice-song-heading"><div><p className="eyebrow">{event.choir.name} · {event.title}</p><div className="practice-song-title-row"><span className="practice-position">{String(clampedIndex + 1).padStart(2, '0')} <i>/ {String(event.lineup.length).padStart(2, '0')}</i></span><div><h2>{current?.song.title}</h2><p>{current?.song.composer_artist || 'Composer or artist not added'}{current?.purpose !== 'other' ? ` · ${labelCase(current?.purpose || '')}` : ''}</p></div></div></div><div className="practice-song-controls"><button className="button-secondary" disabled={clampedIndex === 0} onClick={() => navigate(`/practice/${event.id}/${clampedIndex - 1}`)}><ChevronLeft size={16} /> Previous</button><button className="button-secondary" disabled={clampedIndex >= event.lineup.length - 1} onClick={() => navigate(`/practice/${event.id}/${clampedIndex + 1}`)}>Next <ChevronRight size={16} /></button></div></section>
    <section className="practice-status-card"><div><p className="eyebrow">PREPARATION STATUS</p><strong>{labelCase((current?.preparation_status || '').replace('_', ' '))}</strong></div><div className="practice-status-options">{prepStatuses.map(status => <button key={status} className={current?.preparation_status === status ? 'selected' : ''} disabled={saving} onClick={() => void updateStatus(status)}>{status === 'ready' && <Check size={14} />}{labelCase(status.replace('_', ' '))}</button>)}</div></section>
    <MaterialLearning key={current?.song.id} songId={current?.song.id || 0} songTitle={current?.song.title || ''} />
    {(current?.special_instructions || current?.practice_notes) && <section className="content-card practice-notes"><p className="eyebrow">YOUR EVENT NOTES</p>{current.special_instructions && <p><strong>Instructions</strong><br />{current.special_instructions}</p>}{current.practice_notes && <p><strong>Practice notes</strong><br />{current.practice_notes}</p>}</section>}
    <div className="practice-bottom-nav"><button className="button-secondary" disabled={clampedIndex === 0} onClick={() => navigate(`/practice/${event.id}/${clampedIndex - 1}`)}><ChevronLeft size={16} /> Previous song</button><span>{clampedIndex + 1} of {event.lineup.length}</span><button className="button-primary" disabled={clampedIndex >= event.lineup.length - 1} onClick={() => navigate(`/practice/${event.id}/${clampedIndex + 1}`)}>Next song <ChevronRight size={16} /></button></div>
  </div>
}

function MaterialLearning({ songId, songTitle }: { songId: number; songTitle: string }) {
  const [materials, setMaterials] = useState<SongAttachment[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingOrder, setSavingOrder] = useState(false)
  const [arranging, setArranging] = useState(false)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  useEffect(() => {
    let active = true
    setLoading(true)
    api.get<SongAttachment[]>(`/songs/${songId}/attachments/`).then(async ({ data }) => {
      if (!active) return
      setMaterials(data)
      let first = data[0]?.id ?? null
      const images = data.filter(material => material.kind === 'image')
      if (images.length) {
        const progress = await Promise.all(images.map(async material => {
          try { return { material, ...(await api.get(`/attachments/${material.id}/progress/`)).data } } catch { return { material, last_page: 1, updated_at: null } }
        }))
        const recent = progress.filter(value => value.updated_at).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]
        if (recent) first = recent.material.id
      }
      if (active) setSelectedId(first)
    }).catch(() => { if (active) setError('Learning materials could not be loaded.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [songId])
  const selected = materials.find(material => material.id === selectedId) || null
  const imagePages = useMemo(() => materials.filter(material => material.kind === 'image'), [materials])
  useEffect(() => {
    if (selected?.kind !== 'image' || !imagePages.length) return
    let active = true
    Promise.all(imagePages.map(async material => {
      try { return { material, ...(await api.get(`/attachments/${material.id}/progress/`)).data } }
      catch { return { material, last_page: 1, updated_at: null } }
    })).then(progress => {
      if (!active) return
        const recent = progress.filter(value => value.updated_at).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))[0]
        if (recent) setSelectedId(recent.material.id)
    })
    return () => { active = false }
  }, [selected?.kind, imagePages])
  async function reorderImages(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || savingOrder) return
    const previous = imagePages
    const from = previous.findIndex(page => page.id === event.active.id)
    const to = previous.findIndex(page => page.id === event.over?.id)
    if (from < 0 || to < 0) return
    const ordered = arrayMove(previous, from, to)
    setMaterials(value => [...ordered, ...value.filter(material => material.kind !== 'image')]); setSavingOrder(true); setError('')
    try {
      const { data } = await api.post<SongAttachment[]>(`/songs/${songId}/attachments/reorder-images/`, { attachment_ids: ordered.map(page => page.id) })
      setMaterials(value => [...data, ...value.filter(material => material.kind !== 'image')])
    } catch { setMaterials(value => [...previous, ...value.filter(material => material.kind !== 'image')]); setError('Page order could not be saved. The previous order has been restored.') }
    finally { setSavingOrder(false) }
  }
  return <section className="learning-panel"><header className="learning-header"><div><p className="eyebrow">LEARNING MATERIALS</p><h3>Study {songTitle}</h3></div>{selected?.kind === 'image' && imagePages.length > 1 && <button className="text-action" onClick={() => setArranging(value => !value)}>{arranging ? 'Done arranging' : 'Arrange image pages'}</button>}</header>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {loading ? <div className="material-loading">Loading materials…</div> : !materials.length ? <div className="learning-empty"><Music2 size={20} /><p>No learning materials are attached to this song.</p><Link to="/songs">Add materials in Song Library</Link></div> : <>
      <div className="learning-material-tabs" role="tablist" aria-label="Choose a learning material">{materials.map(material => <button role="tab" aria-selected={selectedId === material.id} className={selectedId === material.id ? 'selected' : ''} key={material.id} onClick={() => setSelectedId(material.id)}>{material.kind === 'image' ? 'Image page' : material.kind === 'youtube' ? 'YouTube' : material.kind === 'pdf' ? 'PDF sheet music' : 'Rehearsal video'}{material.kind === 'image' ? ` ${imagePages.indexOf(material) + 1}` : ''}</button>)}</div>
      {selected && <MaterialViewer key={selected.id} attachment={selected} imagePages={imagePages} />}
      {arranging && imagePages.length > 1 && <div className="image-order-panel"><div><strong>Image page order</strong><span>{savingOrder ? 'Saving…' : 'Drag pages into sequence.'}</span></div><DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={reorderImages}><SortableContext items={imagePages.map(page => page.id)} strategy={verticalListSortingStrategy}><div className="image-order-list">{imagePages.map((page, index) => <SortableImagePage key={page.id} page={page} index={index} />)}</div></SortableContext></DndContext></div>}
    </>}
  </section>
}

function SortableImagePage({ page, index }: { page: SongAttachment; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? .5 : 1 }} className="image-order-row"><button aria-label={`Reorder page ${index + 1}`} {...attributes} {...listeners}><GripVertical size={15} /></button><span>Page {index + 1}</span><strong>{page.title}</strong></div>
}

function MaterialViewer({ attachment, imagePages }: { attachment: SongAttachment; imagePages: SongAttachment[] }) {
  const [blobUrl, setBlobUrl] = useState('')
  const [page, setPage] = useState(1)
  const [currentImageId, setCurrentImageId] = useState(attachment.id)
  const [videoPosition, setVideoPosition] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    let objectUrl = ''
    let active = true
    if (attachment.kind === 'youtube') {
      api.get(`/attachments/${attachment.id}/progress/`).then(({ data }) => { if (active) setVideoPosition(Number(data.video_position) || 0) }).catch(() => { if (active) setError('Viewing progress could not be loaded.') })
      return () => { active = false }
    }
    Promise.all([
      api.get(attachment.file_url || `/attachments/${attachment.id}/file/`, { responseType: 'blob' }),
      api.get(`/attachments/${attachment.id}/progress/`),
    ]).then(([file, progress]) => {
      if (!active) return
      objectUrl = URL.createObjectURL(file.data); setBlobUrl(objectUrl)
      const savedPage = progress.data.last_page || 1
      setPage(savedPage)
      if (attachment.kind === 'image' && imagePages[savedPage - 1]) setCurrentImageId(imagePages[savedPage - 1].id)
      setVideoPosition(Number(progress.data.video_position) || 0)
    }).catch(() => { if (active) setError('This private learning material could not be loaded.') })
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [attachment.id, attachment.kind, attachment.file_url, imagePages])
  async function saveProgress(values: { last_page?: number; video_position?: number }, targetId = attachment.id) {
    try { await api.patch(`/attachments/${targetId}/progress/`, values) }
    catch { setError('Viewing progress could not be saved.') }
  }
  if (attachment.kind === 'youtube') {
    const videoId = youtubeVideoId(attachment.url)
    return <div className="material-viewer"><div className="youtube-player-wrap">{videoId ? <YouTubeViewer videoId={videoId} url={attachment.url} title={attachment.title || 'YouTube learning video'} startAt={videoPosition} onSave={position => void saveProgress({ video_position: position })} /> : <p>This YouTube link cannot be embedded. <a href={attachment.url} target="_blank" rel="noreferrer">Open on YouTube</a></p>}</div></div>
  }
  if (error && !blobUrl) return <div className="inline-error" role="alert">{error}</div>
  if (!blobUrl) return <div className="material-viewer-loading">Opening learning material…</div>
  if (attachment.kind === 'image') {
    const currentIndex = imagePages.findIndex(item => item.id === currentImageId)
    const currentPageNumber = currentIndex >= 0 ? currentIndex + 1 : Math.min(Math.max(page, 1), imagePages.length)
    const currentPage = imagePages[currentPageNumber - 1] || attachment
    function selectPage(next: number) { const target = imagePages[next - 1]; if (!target) return; setCurrentImageId(target.id); setPage(next); void saveProgress({ last_page: next }, target.id) }
    return <div className="material-viewer image-book-viewer">{error && <div className="inline-error" role="alert">{error}</div>}<div className="image-book-toolbar"><button className="button-secondary" disabled={currentPageNumber <= 1} onClick={() => selectPage(currentPageNumber - 1)}><ChevronLeft size={15} /> Previous page</button><label>Page <input aria-label="Image page number" type="number" min="1" max={imagePages.length} value={currentPageNumber} onChange={event => selectPage(Math.min(Math.max(Number(event.target.value), 1), imagePages.length))} /> of {imagePages.length}</label><button className="button-secondary" disabled={currentPageNumber >= imagePages.length} onClick={() => selectPage(currentPageNumber + 1)}>Next page <ChevronRight size={15} /></button></div>{currentPage.id === attachment.id ? <img src={blobUrl} alt={`${attachment.title || 'Sheet music'} — page ${currentPageNumber}`} /> : <ImagePageBlob page={currentPage} />}</div>
  }
  if (attachment.kind === 'pdf') return <div className="material-viewer pdf-viewer"><div className="pdf-toolbar"><label>Page <input aria-label="PDF page to open" type="number" min="1" value={page} onChange={event => { const next = Math.max(Number(event.target.value), 1); setPage(next); void saveProgress({ last_page: next }) }} /></label><span>Use the PDF viewer controls to read and zoom.</span></div><iframe title={attachment.title || 'PDF sheet music'} src={`${blobUrl}#page=${page}&view=FitH`} /></div>
  return <VideoViewer src={blobUrl} initialPosition={videoPosition} onSave={position => void saveProgress({ video_position: position })} error={error} />
}

function ImagePageBlob({ page }: { page: SongAttachment }) {
  const [src, setSrc] = useState('')
  useEffect(() => { let url = ''; let alive = true; api.get(page.file_url || `/attachments/${page.id}/file/`, { responseType: 'blob' }).then(({ data }) => { if (alive) { url = URL.createObjectURL(data); setSrc(url) } }).catch(() => { if (alive) setSrc('') }); return () => { alive = false; if (url) URL.revokeObjectURL(url) } }, [page.id, page.file_url])
  return src ? <img src={src} alt={page.title || 'Sheet music page'} /> : <div className="material-viewer-loading">Loading page…</div>
}

function VideoViewer({ src, initialPosition, onSave, error }: { src: string; initialPosition: number; onSave: (position: number) => void; error: string }) {
  const [restored, setRestored] = useState(false)
  const lastSaved = useRef(0)
  useEffect(() => { setRestored(false) }, [src, initialPosition])
  return <div className="material-viewer video-viewer">{error && <div className="inline-error" role="status">{error}</div>}<video controls src={src} onLoadedMetadata={event => { if (!restored) { event.currentTarget.currentTime = initialPosition; setRestored(true) } }} onTimeUpdate={event => { const video = event.currentTarget; if (video.currentTime - lastSaved.current >= 5) { lastSaved.current = video.currentTime; onSave(Math.round(video.currentTime * 100) / 100) } }} onPause={event => { lastSaved.current = event.currentTarget.currentTime; onSave(Math.round(event.currentTarget.currentTime * 100) / 100) }}><track kind="captions" /></video><button className="text-action" onClick={() => { const video = document.querySelector<HTMLVideoElement>('.video-viewer video'); if (video) { video.currentTime = 0; lastSaved.current = 0; onSave(0) } }}><RotateCcw size={13} /> Start from beginning</button></div>
}

type YouTubePlayer = { destroy?: () => void; getCurrentTime?: () => number; seekTo?: (seconds: number, allowSeekAhead: boolean) => void }
type YouTubeApi = { Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer; PlayerState: { PLAYING: number } }
declare global { interface Window { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void } }

export function readYouTubePosition(player: YouTubePlayer | null) {
  if (typeof player?.getCurrentTime !== 'function') return null
  try {
    const currentTime = player.getCurrentTime()
    return Number.isFinite(currentTime) && currentTime >= 0 ? currentTime : null
  } catch {
    return null
  }
}

let youtubeApiLoad: Promise<YouTubeApi> | null = null
function loadYouTubeApi() {
  if (window.YT) return Promise.resolve(window.YT)
  if (!youtubeApiLoad) youtubeApiLoad = new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { previous?.(); if (window.YT) resolve(window.YT); else reject(new Error('YouTube player is unavailable.')) }
    if (!document.querySelector('script[data-choirlineup-youtube-api]')) {
      const script = document.createElement('script'); script.src = 'https://www.youtube.com/iframe_api'; script.async = true; script.dataset.choirlineupYoutubeApi = 'true'; script.onerror = () => reject(new Error('YouTube player could not be loaded.')); document.head.appendChild(script)
    }
  })
  return youtubeApiLoad
}
function YouTubeViewer({ videoId, url, title, startAt, onSave }: { videoId: string; url: string; title: string; startAt: number; onSave: (position: number) => void }) {
  const mount = useRef<HTMLDivElement>(null)
  const save = useRef(onSave)
  const [error, setError] = useState('')
  save.current = onSave
  useEffect(() => {
    let player: YouTubePlayer | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    let active = true
    loadYouTubeApi().then(YT => {
      if (!active || !mount.current) return
      player = new YT.Player(mount.current, { videoId, playerVars: { start: Math.floor(startAt), rel: 0, playsinline: 1 }, events: {
        onReady: (event: { target: YouTubePlayer }) => { if (startAt > 0 && typeof event.target.seekTo === 'function') event.target.seekTo(startAt, true) },
        onStateChange: (event: { data: number; target: YouTubePlayer }) => {
          if (timer) { clearInterval(timer); timer = null }
          if (event.data === YT.PlayerState.PLAYING) timer = setInterval(() => {
            const position = readYouTubePosition(event.target)
            if (position !== null) save.current(Math.round(position * 100) / 100)
          }, 5000)
          else {
            const position = readYouTubePosition(event.target)
            if (position !== null) save.current(Math.round(position * 100) / 100)
          }
        },
      } })
    }).catch(() => { if (active) setError('YouTube could not be embedded. Open the saved link directly from Song Library.') })
    return () => {
      active = false
      if (timer) clearInterval(timer)
      if (!player) return
      const position = readYouTubePosition(player)
      if (position !== null) save.current(Math.round(position * 100) / 100)
      try { player.destroy?.() } catch { /* YouTube can expose the player before it is ready to destroy. */ }
    }
  }, [videoId, startAt])
  return <div className="youtube-player-shell"><div ref={mount} title={title} />{error && <span role="status">{error} <a href={url} target="_blank" rel="noreferrer">Open on YouTube</a></span>}</div>
}

function youtubeVideoId(value: string) {
  try { const url = new URL(value); if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname)) return ''; const parts = url.pathname.split('/').filter(Boolean); return (url.hostname.endsWith('youtu.be') ? parts[0] : url.pathname === '/watch' ? url.searchParams.get('v') || '' : ['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] || '' : '').match(/^[A-Za-z0-9_-]{11}$/) ? (url.hostname.endsWith('youtu.be') ? parts[0] : url.pathname === '/watch' ? url.searchParams.get('v') || '' : parts[1]) : '' } catch { return '' }
}
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) }
function labelCase(value: string) { return value ? value[0].toUpperCase() + value.slice(1) : '' }
