import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { CalendarDays, CalendarRange, ChevronDown, ChevronsLeft, ChevronsRight, Download, Home, Library, Menu, Mic2, Music2, Plus, Settings, Sparkles, Upload, UsersRound, X } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { api, type Choir, type ChoirEvent, type Song, type User } from './api'
import { SongLibraryPage } from './SongLibrary'
import { RouteErrorBoundary } from './RouteErrorBoundary'

const EventsPage = lazy(() => import('./Events').then(module => ({ default: module.EventsPage })))
const PracticePage = lazy(() => import('./Practice').then(module => ({ default: module.PracticePage })))
const CalendarPage = lazy(() => import('./CalendarPage').then(module => ({ default: module.CalendarPage })))

const voiceOptions = ['soprano', 'alto', 'tenor', 'bass', 'custom']
type ChoirFields = Pick<Choir, 'name' | 'description' | 'color' | 'voice_classification' | 'custom_voice'>
type DashboardPrefs = { showChoirs: boolean; showStartHere: boolean }

const defaultPrefs: DashboardPrefs = { showChoirs: true, showStartHere: true }
function readPrefs(): DashboardPrefs {
  try { return { ...defaultPrefs, ...JSON.parse(localStorage.getItem('choirlineup-dashboard') || '{}') } } catch { return defaultPrefs }
}

export function Workspace({ user, onUserChange, onLogout }: { user: User; onUserChange: (user: User) => void; onLogout: () => void }) {
  const [choirs, setChoirs] = useState<Choir[]>([])
  const [choirsLoading, setChoirsLoading] = useState(true)
  const [choirError, setChoirError] = useState('')
  const [selectedChoir, setSelectedChoir] = useState<number | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [theme, setTheme] = useState(localStorage.getItem('choirlineup-theme') || 'light')
  const [weekStart, setWeekStart] = useState(localStorage.getItem('choirlineup-week-start') || 'sunday')
  const [dashboardPrefs, setDashboardPrefs] = useState(readPrefs)
  const [songCount, setSongCount] = useState<number | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<ChoirEvent[]>([])
  const location = useLocation()
  const navigate = useNavigate()

  async function loadChoirs() {
    setChoirError('')
    try {
      const { data } = await api.get<Choir[]>('/choirs/')
      setChoirs(data)
      setSelectedChoir(current => current && data.some(choir => choir.id === current) ? current : data[0]?.id ?? null)
    } catch { setChoirError('Choirs could not be loaded. Check your connection and try again.') }
    finally { setChoirsLoading(false) }
  }
  useEffect(() => { void loadChoirs() }, [])
  useEffect(() => {
    if (location.pathname !== '/dashboard' && location.pathname !== '/') return
    api.get<Song[]>('/songs/').then(({ data }) => setSongCount(data.length)).catch(() => setSongCount(null))
    api.get<ChoirEvent[]>('/events/').then(({ data }) => setUpcomingEvents(data.filter(event => ['upcoming', 'preparing'].includes(event.status)).slice(0, 4))).catch(() => setUpcomingEvents([]))
  }, [location.pathname])
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('choirlineup-theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('choirlineup-week-start', weekStart) }, [weekStart])
  useEffect(() => { localStorage.setItem('choirlineup-dashboard', JSON.stringify(dashboardPrefs)) }, [dashboardPrefs])

  const selected = choirs.find(choir => choir.id === selectedChoir) ?? null
  const titles: Record<string, string> = { '/dashboard': 'Dashboard', '/choirs': 'My choirs', '/events': 'Events', '/calendar': 'Calendar', '/songs': 'Song library', '/practice': 'Practice', '/profile': 'My profile', '/settings': 'Settings' }
  const pageTitle = titles[location.pathname] || (location.pathname.startsWith('/choirs/') ? 'Choir details' : location.pathname.startsWith('/events/') ? 'Event details' : location.pathname.startsWith('/practice/') ? 'Practice' : location.pathname.startsWith('/calendar/') ? 'Calendar' : 'Dashboard')
  const navigation = [
    { to: '/dashboard', label: 'Dashboard', icon: Home },
    { to: '/choirs', label: 'My choirs', icon: UsersRound },
    { to: '/events', label: 'Events', icon: CalendarDays },
    { to: '/calendar', label: 'Calendar', icon: CalendarRange },
    { to: '/songs', label: 'Song library', icon: Library },
    { to: '/practice', label: 'Practice', icon: Mic2 },
  ]
  function updateDashboardPrefs(patch: Partial<DashboardPrefs>) { setDashboardPrefs(current => ({ ...current, ...patch })) }
  async function logout() {
    try { await api.post('/auth/logout/') } catch { /* Local sign-out still clears the credential if the API is offline. */ }
    onLogout()
    navigate('/login')
  }

  return <div className={`workspace ${collapsed ? 'sidebar-is-collapsed' : ''}`}>
    {mobileOpen && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
    <aside className={`sidebar ${mobileOpen ? 'mobile-is-open' : ''}`}>
      <div className="side-brand"><span className="brand-icon"><Music2 size={20} /></span><span className="side-brand-name">ChoirLineup</span><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}><X size={18} /></button></div>
      <div className="side-section-label">WORKSPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        {navigation.map(item => <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}><item.icon size={18} /><span>{item.label}</span></NavLink>)}
      </nav>
      <div className="side-choir-heading"><span className="side-section-label">YOUR CHOIRS</span><button className="icon-button tiny" title="Add choir" onClick={() => { navigate('/choirs?new=1'); setMobileOpen(false) }}><Plus size={16} /></button></div>
      <div className="sidebar-choirs">
        {choirsLoading ? <span className="side-muted">Loading choirs…</span> : choirs.length ? choirs.map(choir => <button key={choir.id} className={`choir-switch ${selectedChoir === choir.id ? 'selected' : ''}`} onClick={() => { setSelectedChoir(choir.id); navigate('/choirs'); setMobileOpen(false) }} title={choir.name}><i style={{ backgroundColor: choir.color }} /><span>{choir.name}</span></button>) : <span className="side-muted">Your choirs will appear here</span>}
      </div>
      <div className="sidebar-bottom">
        <NavLink to="/profile" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}><Avatar user={user} /><span>My profile</span></NavLink>
        <NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={() => setMobileOpen(false)}><Settings size={18} /><span>Settings</span></NavLink>
        <div className="side-user"><Avatar user={user} /><div className="side-user-details"><strong>{user.full_name}</strong><span>{user.email}</span></div><button className="icon-button tiny" onClick={() => void logout()} aria-label="Sign out"><ChevronDown size={17} /></button></div>
      </div>
      <button className="collapse-button" onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>{collapsed ? <ChevronsRight size={17} /> : <><ChevronsLeft size={17} /><span>Collapse sidebar</span></>}</button>
    </aside>

    <main className="workspace-main">
      <header className="workspace-header">
        <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu size={20} /></button>
        <div><p className="header-kicker">YOUR PERSONAL MUSIC SPACE</p><h1>{pageTitle}</h1></div>
        <div className="header-actions"><span className="header-date">{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date())}</span><button className="avatar-button" title="Open profile" onClick={() => navigate('/profile')}><Avatar user={user} /></button></div>
      </header>
      <div className="workspace-content">
        {choirError && <div className="inline-error" role="alert">{choirError} <button onClick={() => void loadChoirs()}>Retry</button></div>}
        <Routes>
          <Route path="/dashboard" element={<DashboardPage user={user} choirs={choirs} loading={choirsLoading} songCount={songCount} events={upcomingEvents} prefs={dashboardPrefs} onCreate={() => navigate('/choirs?new=1')} />} />
          <Route path="/choirs/*" element={<ChoirsPage choirs={choirs} loading={choirsLoading} selected={selected} onSelect={setSelectedChoir} onReload={loadChoirs} />} />
          <Route path="/events/*" element={<Suspense fallback={<div className="route-loading">Opening events…</div>}><EventsPage choirs={choirs} /></Suspense>} />
          <Route path="/calendar/*" element={<Suspense fallback={<div className="calendar-loading">Opening your calendar…</div>}><CalendarPage weekStart={weekStart} choirs={choirs} /></Suspense>} />
          <Route path="/practice/*" element={<RouteErrorBoundary title="Practice" returnTo="/events" returnLabel="Return to events"><Suspense fallback={<div className="route-loading">Opening practice…</div>}><PracticePage /></Suspense></RouteErrorBoundary>} />
          <Route path="/songs" element={<SongLibraryPage choirs={choirs} />} />
          <Route path="/profile" element={<ProfilePage user={user} onUserChange={onUserChange} />} />
          <Route path="/settings" element={<SettingsPage theme={theme} setTheme={setTheme} weekStart={weekStart} setWeekStart={setWeekStart} prefs={dashboardPrefs} setPrefs={updateDashboardPrefs} />} />
          <Route path="*" element={<DashboardPage user={user} choirs={choirs} loading={choirsLoading} songCount={songCount} events={upcomingEvents} prefs={dashboardPrefs} onCreate={() => navigate('/choirs?new=1')} />} />
        </Routes>
      </div>
      <footer className="app-footer"><span>ChoirLineup <span>·</span> Personal music, in harmony.</span><span>Personal workspace</span></footer>
    </main>
  </div>
}

function Avatar({ user, small = false }: { user: User; small?: boolean }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    let objectUrl = ''
    if (user.profile_picture_url) api.get(user.profile_picture_url, { responseType: 'blob', signal: controller.signal }).then(({ data }) => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(data); setSrc(objectUrl) } }).catch(() => { if (!controller.signal.aborted) setSrc('') })
    else setSrc('')
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [user.profile_picture_url])
  return <span className={`avatar ${small ? 'avatar-small' : ''}`}>{src ? <img src={src} alt="" /> : user.full_name.split(/\s+/).map(part => part[0]).slice(0, 2).join('').toUpperCase()}</span>
}

function DashboardPage({ user, choirs, loading, songCount, events, prefs, onCreate }: { user: User; choirs: Choir[]; loading: boolean; songCount: number | null; events: ChoirEvent[]; prefs: DashboardPrefs; onCreate: () => void }) {
  const firstName = user.full_name.trim().split(/\s+/)[0] || 'singer'
  return <div className="page-stack">
    <section className="welcome-panel"><div className="welcome-panel-copy"><p className="eyebrow">A GOOD DAY TO SING</p><h2>Welcome back, {firstName}.</h2><p>Your music life, gathered in one place. Start with a choir and build your personal repertoire as you go.</p><button className="button-primary" onClick={onCreate}><Plus size={16} /> Add a choir</button></div><div className="welcome-note" aria-hidden="true"><span>♫</span><i /><i /><i /><i /><i /></div></section>
    <div className="overview-grid">
      <article className="metric-card"><div className="metric-icon green"><UsersRound size={18} /></div><span className="metric-label">My choirs</span><strong>{loading ? '—' : choirs.length}</strong><span className="metric-caption">{choirs.length === 1 ? 'A place to sing together' : 'Personal choir spaces'}</span></article>
      <article className="metric-card"><div className="metric-icon cream"><Music2 size={18} /></div><span className="metric-label">Song library</span><strong>{songCount === null ? '—' : songCount}</strong><span className="metric-caption">Reusable songs in your library</span></article>
      <article className="metric-card"><div className="metric-icon lavender"><CalendarDays size={18} /></div><span className="metric-label">Upcoming events</span><strong>{events.length}</strong><span className="metric-caption">Events being prepared or upcoming</span></article>
    </div>
    {prefs.showChoirs && <section className="content-card"><div className="section-heading"><div><p className="eyebrow">YOUR COMMUNITY</p><h3>Choirs</h3></div><Link to="/choirs" className="subtle-link">View all <span>→</span></Link></div>
      {loading ? <div className="skeleton-row" /> : choirs.length ? <div className="dashboard-choir-grid">{choirs.slice(0, 3).map(choir => <Link to="/choirs" className="dashboard-choir" key={choir.id}><span className="choir-color-block" style={{ backgroundColor: choir.color }}><Music2 size={17} /></span><span className="dashboard-choir-info"><strong>{choir.name}</strong><small>{voiceLabel(choir)}</small></span><span className="card-arrow">↗</span></Link>)}</div> : <div className="empty-state"><span className="empty-icon"><UsersRound size={20} /></span><div><strong>Your choir list starts here</strong><p>Add each choir you sing with. You can set a different voice part for every one.</p></div><button className="button-secondary" onClick={onCreate}>Create a choir</button></div>}
    </section>}
    <section className="content-card dashboard-events"><div className="section-heading"><div><p className="eyebrow">NEXT ON YOUR MUSIC STAND</p><h3>Upcoming events</h3></div><Link to="/events" className="subtle-link">View all <span>→</span></Link></div>
      {events.length ? <div className="dashboard-event-list">{events.map(event => <Link to={`/events/${event.id}`} className="dashboard-event-row" key={event.id}><span className="dashboard-event-date">{new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${event.date}T12:00:00`))}</span><span className="dashboard-event-info"><strong>{event.title}</strong><small><i style={{ backgroundColor: event.choir.color }} />{event.choir.name}{event.venue ? ` · ${event.venue}` : ''}</small></span><span className={`event-status status-${event.status}`}>{event.ready_count}/{event.lineup_count} ready</span></Link>)}</div> : <div className="empty-state"><span className="empty-icon"><CalendarDays size={20} /></span><div><strong>No upcoming events</strong><p>Add a performance or rehearsal to see your preparation plan here.</p></div><Link to="/events" className="button-secondary">Create an event</Link></div>}
    </section>
    {prefs.showStartHere && <section className="next-step-card"><div className="step-spark"><Sparkles size={18} /></div><div><p className="eyebrow">YOUR NEXT STEP</p><h3>Make room for your music.</h3><p>Set up your choirs now. Songs, learning materials, events, and rehearsal plans will connect to them as the workspace grows.</p></div><button className="button-secondary" onClick={onCreate}>{choirs.length ? 'Add another choir' : 'Set up a choir'} <span>→</span></button></section>}
  </div>
}

function ChoirsPage({ choirs, loading, selected, onSelect, onReload }: { choirs: Choir[]; loading: boolean; selected: Choir | null; onSelect: (id: number | null) => void; onReload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Choir | null | 'new'>(null)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (new URLSearchParams(location.search).get('new') === '1') { setEditing('new'); navigate('/choirs', { replace: true }) }
  }, [location.search, navigate])
  async function save(values: ChoirFields, id?: number) {
    setSaving(true); setError(''); setNotice('')
    try {
      if (id) await api.patch(`/choirs/${id}/`, values)
      else await api.post('/choirs/', values)
      await onReload(); setEditing(null); setNotice(id ? 'Choir details updated.' : 'Your choir has been added.')
    } catch (e: any) { setError(apiError(e, 'The choir could not be saved. Please try again.')) }
    finally { setSaving(false) }
  }
  async function remove(choir: Choir) {
    if (!window.confirm(`Delete “${choir.name}”? This removes the choir record. Any songs in your personal library will remain.`)) return
    try { await api.delete(`/choirs/${choir.id}/`); if (selected?.id === choir.id) onSelect(null); await onReload(); setNotice('Choir deleted.') }
    catch { setError('The choir could not be deleted. Please try again.') }
  }
  return <div className="page-stack">
    <div className="page-intro-row"><div><p className="eyebrow">YOUR SINGING LIFE</p><h2>My choirs <span className="count-pill">{choirs.length}</span></h2><p className="muted">Keep every choir’s details and your voice part together.</p></div><button className="button-primary" onClick={() => setEditing('new')}><Plus size={16} /> Add choir</button></div>
    {notice && <div className="success-banner" role="status">{notice}<button aria-label="Dismiss" onClick={() => setNotice('')}>×</button></div>}
    {error && <div className="inline-error" role="alert">{error}</div>}
    {loading ? <div className="choir-list">{[1, 2].map(i => <div className="skeleton-row" key={i} />)}</div> : choirs.length ? <div className="choir-list">{choirs.map(choir => <article key={choir.id} className={`choir-card ${selected?.id === choir.id ? 'is-selected' : ''}`}>
      <button className="choir-card-main" onClick={() => onSelect(selected?.id === choir.id ? null : choir.id)}><span className="choir-emblem" style={{ backgroundColor: choir.color }}><Music2 size={20} /></span><span className="choir-card-details"><strong>{choir.name}</strong><span>{voiceLabel(choir)}</span>{choir.description && <small>{choir.description}</small>}</span><span className="chevron-mark">{selected?.id === choir.id ? '−' : '+'}</span></button>
      {selected?.id === choir.id && <div className="choir-expanded"><div className="choir-meta"><span><i className="color-dot" style={{ backgroundColor: choir.color }} /> Choir color</span><span>Added {new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' }).format(new Date(choir.created_at))}</span></div><div className="choir-actions"><button className="button-secondary" onClick={() => setEditing(choir)}>Edit details</button><button className="button-danger-quiet" onClick={() => void remove(choir)}>Delete choir</button></div></div>}
    </article>)}</div> : <section className="large-empty"><span className="empty-icon"><UsersRound size={22} /></span><h3>No choirs yet</h3><p>Add the choirs you sing with. Your voice classification is stored separately for each choir.</p><button className="button-primary" onClick={() => setEditing('new')}><Plus size={16} /> Create your first choir</button></section>}
    {editing && <ChoirEditor choir={editing === 'new' ? null : editing} saving={saving} error={error} onClose={() => { setEditing(null); setError('') }} onSave={values => void save(values, editing === 'new' ? undefined : editing.id)} />}
  </div>
}

function ChoirEditor({ choir, saving, error, onClose, onSave }: { choir: Choir | null; saving: boolean; error: string; onClose: () => void; onSave: (values: ChoirFields) => void }) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<ChoirFields>({ defaultValues: choir ? { name: choir.name, description: choir.description, color: choir.color, voice_classification: choir.voice_classification, custom_voice: choir.custom_voice } : { color: '#728b72', voice_classification: 'custom', custom_voice: '' } })
  const voice = watch('voice_classification')
  return <div className="modal-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="choir-editor-title"><div className="modal-header"><div><p className="eyebrow">YOUR CHOIR DETAILS</p><h3 id="choir-editor-title">{choir ? 'Edit choir' : 'Add a choir'}</h3></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    <form className="modal-form" onSubmit={handleSubmit(onSave)}>
      <label>Choir name<input autoFocus placeholder="e.g. Riverside Community Choir" {...register('name', { required: 'Enter a choir name.', maxLength: { value: 120, message: 'Use 120 characters or fewer.' } })} />{errors.name && <small className="field-error">{errors.name.message}</small>}</label>
      <label>Description <span className="optional">Optional</span><textarea rows={3} placeholder="A note to help you recognize this choir" {...register('description')} /></label>
      <div className="form-split"><label>Your voice part<select {...register('voice_classification', { required: true })}>{voiceOptions.map(option => <option value={option} key={option}>{labelCase(option)}</option>)}</select></label><label>Choir color<input type="color" className="color-input" {...register('color', { required: true })} /></label></div>
      {voice === 'custom' && <label>Custom voice part<input placeholder="e.g. Contralto" {...register('custom_voice', { required: 'Add your custom voice part.', maxLength: { value: 60, message: 'Use 60 characters or fewer.' } })} />{errors.custom_voice && <small className="field-error">{errors.custom_voice.message}</small>}</label>}
      {error && <div className="error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={saving}>{saving ? 'Saving…' : choir ? 'Save changes' : 'Create choir'}</button></div>
    </form>
  </section></div>
}

function ProfilePage({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const { register, handleSubmit, reset, formState: { isDirty, isSubmitting } } = useForm<Pick<User, 'full_name' | 'default_voice'>>({ defaultValues: { full_name: user.full_name, default_voice: user.default_voice } })
  const [picture, setPicture] = useState<File | null>(null)
  const [removePicture, setRemovePicture] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => reset({ full_name: user.full_name, default_voice: user.default_voice }), [user.full_name, user.default_voice, reset])
  async function submit(values: Pick<User, 'full_name' | 'default_voice'>) {
    setError(''); setNotice('')
    const body = new FormData()
    body.append('full_name', values.full_name)
    body.append('default_voice', values.default_voice)
    if (picture) body.append('profile_picture', picture)
    if (removePicture) body.append('remove_profile_picture', 'true')
    try {
      const { data } = await api.patch<User>('/auth/profile/', body)
      onUserChange(data); setPicture(null); setRemovePicture(false); reset({ full_name: data.full_name, default_voice: data.default_voice }); setNotice('Your profile has been updated.')
    } catch (e: any) { setError(apiError(e, 'Your profile could not be saved. Please try again.')) }
  }
  return <div className="page-stack page-narrow">
    <div className="page-intro-row"><div><p className="eyebrow">ABOUT YOU</p><h2>My profile</h2><p className="muted">Keep your personal details and default voice up to date.</p></div></div>
    {notice && <div className="success-banner" role="status">{notice}</div>}{error && <div className="inline-error" role="alert">{error}</div>}
    <form className="content-card profile-card" onSubmit={handleSubmit(submit)}>
      <div className="profile-picture-row"><Avatar user={user} /><div><strong>Your profile picture</strong><p>JPEG, PNG, or WebP · up to 5 MB</p><label className="upload-button">Choose image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setPicture(event.target.files?.[0] || null); setRemovePicture(false) }} /></label>{user.profile_picture_url && !removePicture && <button type="button" className="remove-picture" onClick={() => { setRemovePicture(true); setPicture(null) }}>Remove picture</button>}{removePicture && <button type="button" className="remove-picture" onClick={() => setRemovePicture(false)}>Undo removal</button>}{picture && <span className="selected-file">{picture.name}</span>}</div></div>
      <div className="profile-divider" />
      <label>Full name<input {...register('full_name', { required: true, maxLength: 160 })} /></label>
      <label>Email address<input value={user.email} disabled /><small className="help-text">Email address is used to sign in and cannot be changed here.</small></label>
      <label>Default voice classification<select {...register('default_voice', { required: true })}>{voiceOptions.map(option => <option value={option} key={option}>{labelCase(option)}</option>)}</select></label>
      <div className="profile-save"><button className="button-primary" disabled={isSubmitting || (!isDirty && !picture && !removePicture)}>{isSubmitting ? 'Saving…' : 'Save profile'}</button></div>
    </form>
  </div>
}

export function SettingsPage({ theme, setTheme, weekStart, setWeekStart, prefs, setPrefs }: { theme: string; setTheme: (theme: string) => void; weekStart: string; setWeekStart: (day: string) => void; prefs: DashboardPrefs; setPrefs: (prefs: Partial<DashboardPrefs>) => void }) {
  const [mode, setMode] = useState('merge')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  async function exportData(format: 'json' | 'zip') {
    setBusy(true); setNotice(''); setError('')
    try {
      const { data } = await api.get(`/auth/export/?type=${format}`, { responseType: 'blob' })
      const href = URL.createObjectURL(data); const link = document.createElement('a'); link.href = href
      link.download = format === 'zip' ? 'choirlineup-backup.zip' : 'choirlineup-export.json'; link.click(); URL.revokeObjectURL(href)
      setNotice('Your account data has been downloaded.')
    } catch (e: any) { setError(apiError(e, 'The export could not be created. Please try again.')) }
    finally { setBusy(false) }
  }
  async function importData() {
    if (!file) { setError('Choose a JSON or ZIP backup first.'); return }
    if (mode === 'replace' && !window.confirm('Replace removes your current choirs, songs, events, materials, and progress. A recoverable backup will be created before this runs. Continue?')) return
    setBusy(true); setNotice(''); setError('')
    const body = new FormData(); body.append('file', file); body.append('mode', mode)
    try { const { data } = await api.post('/auth/import/', body); setNotice(`Import complete: ${data.counts.choirs} choirs, ${data.counts.songs} songs, and ${data.counts.events} events processed.`); setFile(null) }
    catch (e: any) { setError(apiError(e, 'The backup could not be imported. Your data was not changed.')) }
    finally { setBusy(false) }
  }
  return <div className="page-stack page-narrow"><div className="page-intro-row"><div><p className="eyebrow">MAKE IT YOURS</p><h2>Settings</h2><p className="muted">Small preferences to make your workspace feel right.</p></div></div>
    <section className="content-card settings-card"><div className="settings-group-title"><span className="settings-icon"><Sparkles size={17} /></span><div><h3>Appearance</h3><p>Choose the look that feels comfortable for practice.</p></div></div><div className="setting-row"><div><strong>Theme</strong><span>Switch between light and dark mode.</span></div><div className="segmented-control"><button className={theme === 'light' ? 'selected' : ''} onClick={() => setTheme('light')}>Light</button><button className={theme === 'dark' ? 'selected' : ''} onClick={() => setTheme('dark')}>Dark</button></div></div>
    <div className="settings-divider" /><div className="settings-group-title"><span className="settings-icon"><CalendarDays size={17} /></span><div><h3>Calendar</h3><p>Set the first day of your week. This preference will apply to the calendar.</p></div></div><div className="setting-row"><div><strong>Week starts on</strong><span>Used by the preparation calendar.</span></div><select className="compact-select" value={weekStart} onChange={event => setWeekStart(event.target.value)}><option value="sunday">Sunday</option><option value="monday">Monday</option></select></div>
    <div className="settings-divider" /><div className="settings-group-title"><span className="settings-icon"><Home size={17} /></span><div><h3>Dashboard</h3><p>Choose which sections appear on your home screen.</p></div></div><ToggleRow title="Choir overview" description="Show the choir cards on your dashboard." checked={prefs.showChoirs} onChange={checked => setPrefs({ showChoirs: checked })} /><ToggleRow title="Getting started" description="Show a suggested next step on your dashboard." checked={prefs.showStartHere} onChange={checked => setPrefs({ showStartHere: checked })} />
    <div className="settings-divider" /><div className="settings-group-title"><span className="settings-icon"><Download size={17} /></span><div><h3>Data portability</h3><p>Download your personal workspace or restore it from a ChoirLineup export.</p></div></div>
    <div className="setting-row"><div><strong>Export your data</strong><span>JSON includes your records and media; ZIP is a complete account backup.</span></div><div className="backup-actions"><button className="button-secondary" disabled={busy} onClick={() => void exportData('json')}>JSON</button><button className="button-secondary" disabled={busy} onClick={() => void exportData('zip')}>ZIP backup</button></div></div>
    <div className="setting-row backup-import"><div><strong>Import a backup</strong><span>Merge adds records; matching choir/category/song/event details are reused. Replace clears your personal workspace after a recoverable backup is made.</span></div><div className="backup-import-controls"><input aria-label="Backup file" type="file" accept=".json,.zip,application/json,application/zip" onChange={event => setFile(event.target.files?.[0] || null)} /><select className="compact-select" aria-label="Import behavior" value={mode} onChange={event => setMode(event.target.value)}><option value="merge">Merge</option><option value="replace">Replace</option></select><button className="button-primary" disabled={busy || !file} onClick={() => void importData()}><Upload size={15} />{busy ? 'Working…' : 'Import'}</button></div></div>
    {notice && <div className="success-banner" role="status">{notice}</div>}{error && <div className="inline-error" role="alert">{error}</div>}</section>
  </div>
}

function ToggleRow({ title, description, checked, onChange }: { title: string; description: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <div className="setting-row toggle-setting"><div><strong>{title}</strong><span>{description}</span></div><button role="switch" aria-checked={checked} className={`switch ${checked ? 'on' : ''}`} onClick={() => onChange(!checked)}><span /></button></div>
}

function voiceLabel(choir: Choir) { return choir.voice_classification === 'custom' ? choir.custom_voice : labelCase(choir.voice_classification) }
function labelCase(value: string) { return value ? value[0].toUpperCase() + value.slice(1) : '' }
function apiError(error: any, fallback: string) {
  const detail = error.response?.data
  if (typeof detail === 'string') return detail
  return Object.values(detail || {}).flat().filter(value => typeof value === 'string').join(' ') || fallback
}
