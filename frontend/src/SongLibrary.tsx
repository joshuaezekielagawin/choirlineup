import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { FileImage, FileMusic, Film, Link2, Music2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { api, type Choir, type Song, type SongAttachment, type SongCategory } from './api'

const voices = ['', 'soprano', 'alto', 'tenor', 'bass', 'custom']
type SongFields = Pick<Song, 'title' | 'composer_artist' | 'language' | 'musical_key' | 'description' | 'voice_classification'> & { choir_ids: number[]; category_ids: number[] }
type MaterialKind = SongAttachment['kind']

export function SongLibraryPage({ choirs }: { choirs: Choir[] }) {
  const [songs, setSongs] = useState<Song[]>([])
  const [categories, setCategories] = useState<SongCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [choirFilter, setChoirFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [voiceFilter, setVoiceFilter] = useState('')
  const [languageFilter, setLanguageFilter] = useState('')
  const [keyFilter, setKeyFilter] = useState('')
  const [sort, setSort] = useState('recent')
  const [refresh, setRefresh] = useState(0)
  const [editing, setEditing] = useState<Song | 'new' | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)

  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 220); return () => window.clearTimeout(timer) }, [search])
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    api.get<Song[]>('/songs/', { params: { search: debouncedSearch, choir: choirFilter, category: categoryFilter, voice: voiceFilter, language: languageFilter, key: keyFilter, sort } })
      .then(({ data }) => { if (active) setSongs(data) })
      .catch(() => { if (active) setError('Your song library could not be loaded. Check your connection and try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [debouncedSearch, choirFilter, categoryFilter, voiceFilter, languageFilter, keyFilter, sort, refresh])
  useEffect(() => { let active = true; api.get<SongCategory[]>('/song-categories/').then(({ data }) => { if (active) setCategories(data) }).catch(() => { if (active) setError('Song categories could not be loaded.') }); return () => { active = false } }, [refresh])

  async function saveSong(values: SongFields, song?: Song) {
    setError(''); setNotice('')
    try {
      const { data } = song ? await api.patch<Song>(`/songs/${song.id}/`, values) : await api.post<Song>('/songs/', values)
      setEditing(null); setExpanded(data.id); setRefresh(value => value + 1); setNotice(song ? 'Song details saved.' : 'Song added to your library.')
    } catch (e) { setError(apiError(e, 'The song could not be saved. Please check the details and try again.')) }
  }
  async function deleteSong(song: Song) {
    if (!window.confirm(`Delete “${song.title}” and its learning materials from your library? This cannot be undone.`)) return
    try { await api.delete(`/songs/${song.id}/`); if (expanded === song.id) setExpanded(null); setRefresh(value => value + 1); setNotice('Song and its learning materials deleted.') }
    catch { setError('The song could not be deleted. Please try again.') }
  }
  async function createCategory(name: string) {
    try {
      const { data } = await api.post<SongCategory>('/song-categories/', { name })
      setCategories(current => [...current, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNotice(`Category “${data.name}” added.`)
    } catch (e) { setError(apiError(e, 'The category could not be added. It may already exist.')) }
  }
  async function deleteCategory(category: SongCategory) {
    if (!window.confirm(`Delete the “${category.name}” category? Songs will remain in your library.`)) return
    try { await api.delete(`/song-categories/${category.id}/`); setRefresh(value => value + 1); setNotice('Category deleted.') }
    catch { setError('The category could not be deleted.') }
  }

  return <div className="page-stack song-library-page">
    <div className="page-intro-row"><div><p className="eyebrow">YOUR REPERTOIRE</p><h2>Song library <span className="count-pill">{loading ? '…' : songs.length}</span></h2><p className="muted">One song can belong to several choirs. Keep its learning materials together.</p></div><button className="button-primary" onClick={() => setEditing('new')}><Plus size={16} /> Add song</button></div>
    {(notice || error) && <div className={error ? 'inline-error' : 'success-banner'} role={error ? 'alert' : 'status'}>{error || notice}<button aria-label="Dismiss" onClick={() => { setError(''); setNotice('') }}>×</button></div>}
    <section className="song-filters" aria-label="Search and filter songs">
      <label className="song-search"><Search size={16} /><input aria-label="Search song titles" placeholder="Search by song title" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className="filter-grid"><select aria-label="Filter by choir" value={choirFilter} onChange={event => setChoirFilter(event.target.value)}><option value="">All choirs</option>{choirs.map(choir => <option key={choir.id} value={choir.id}>{choir.name}</option>)}</select>
        <select aria-label="Filter by category" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
        <select aria-label="Filter by voice" value={voiceFilter} onChange={event => setVoiceFilter(event.target.value)}><option value="">All voice parts</option>{voices.slice(1).map(voice => <option key={voice} value={voice}>{labelCase(voice)}</option>)}</select>
        <input aria-label="Filter by language" placeholder="Language" value={languageFilter} onChange={event => setLanguageFilter(event.target.value)} />
        <input aria-label="Filter by musical key" placeholder="Musical key" value={keyFilter} onChange={event => setKeyFilter(event.target.value)} />
        <select aria-label="Sort songs" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Recently added</option><option value="title">Alphabetical</option></select>
      </div>
    </section>
    <CategoryManager categories={categories} onCreate={createCategory} onDelete={deleteCategory} />
    {loading ? <div className="song-list">{[0, 1, 2].map(item => <div className="skeleton-row" key={item} />)}</div> : songs.length ? <div className="song-list">{songs.map(song => <article className={`song-card ${expanded === song.id ? 'song-expanded' : ''}`} key={song.id}>
      <button className="song-card-head" onClick={() => setExpanded(expanded === song.id ? null : song.id)} aria-expanded={expanded === song.id}><span className="song-cover"><Music2 size={19} /></span><span className="song-main-info"><strong>{song.title}</strong><small>{song.composer_artist || 'Composer or artist not added'}{song.language ? ` · ${song.language}` : ''}{song.musical_key ? ` · ${song.musical_key}` : ''}</small><span className="song-tags">{song.choirs.map(choir => <span className="song-tag choir-tag" key={choir.id}><i style={{ backgroundColor: choir.color }} />{choir.name}</span>)}{song.categories.map(category => <span className="song-tag" key={category.id}>{category.name}</span>)}</span></span><span className="song-extra"><small>{song.attachment_count} {song.attachment_count === 1 ? 'material' : 'materials'}</small><span>{expanded === song.id ? '−' : '+'}</span></span></button>
      {expanded === song.id && <div className="song-details"><div className="song-detail-toolbar"><span>{song.voice_classification ? `${labelCase(song.voice_classification)} voice` : 'Voice part not specified'}</span><div><button className="button-secondary" onClick={() => setEditing(song)}><Pencil size={13} /> Edit</button><button className="button-danger-quiet" onClick={() => void deleteSong(song)}><Trash2 size={13} /> Delete</button></div></div>{song.description && <p className="song-description">{song.description}</p>}<MaterialManager song={song} onChange={() => setRefresh(value => value + 1)} /></div>}
    </article>)}</div> : <section className="large-empty"><span className="empty-icon"><Music2 size={22} /></span><h3>{search || choirFilter || categoryFilter || voiceFilter || languageFilter || keyFilter ? 'No songs match these filters' : 'Your library is ready for its first song'}</h3><p>{search || choirFilter || categoryFilter || voiceFilter || languageFilter || keyFilter ? 'Try changing or clearing a filter.' : 'Add a song once, then connect it to any of your choirs.'}</p>{!songs.length && !(search || choirFilter || categoryFilter || voiceFilter || languageFilter || keyFilter) && <button className="button-primary" onClick={() => setEditing('new')}><Plus size={15} /> Add a song</button>}</section>}
    {editing && <SongEditor key={editing === 'new' ? 'new-song' : editing.id} song={editing === 'new' ? null : editing} choirs={choirs} categories={categories} onClose={() => setEditing(null)} onSave={values => void saveSong(values, editing === 'new' ? undefined : editing)} />}
  </div>
}

function SongEditor({ song, choirs, categories, onClose, onSave }: { song: Song | null; choirs: Choir[]; categories: SongCategory[]; onClose: () => void; onSave: (values: SongFields) => void }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Omit<SongFields, 'choir_ids' | 'category_ids'>>({ defaultValues: song ? { title: song.title, composer_artist: song.composer_artist, language: song.language, musical_key: song.musical_key, description: song.description, voice_classification: song.voice_classification } : { voice_classification: '' } })
  const [choirIds, setChoirIds] = useState<number[]>(song?.choirs.map(item => item.id) || [])
  const [categoryIds, setCategoryIds] = useState<number[]>(song?.categories.map(item => item.id) || [])
  const toggle = (id: number, values: number[], setValues: (v: number[]) => void) => setValues(values.includes(id) ? values.filter(value => value !== id) : [...values, id])
  return <div className="modal-scrim" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><section className="modal-card song-editor" role="dialog" aria-modal="true" aria-labelledby="song-editor-title"><div className="modal-header"><div><p className="eyebrow">YOUR SONG LIBRARY</p><h3 id="song-editor-title">{song ? 'Edit song details' : 'Add a song'}</h3></div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={19} /></button></div>
    <form className="modal-form" onSubmit={handleSubmit(values => onSave({ ...values, choir_ids: choirIds, category_ids: categoryIds }))}>
      <label>Song title<input autoFocus placeholder="Song title" {...register('title', { required: 'Enter a song title.', maxLength: { value: 180, message: 'Use 180 characters or fewer.' } })} />{errors.title && <small className="field-error">{errors.title.message}</small>}</label>
      <div className="song-form-split"><label>Composer or artist<input placeholder="Optional" {...register('composer_artist')} /></label><label>Language<input placeholder="e.g. English" {...register('language')} /></label></div>
      <div className="song-form-split"><label>Musical key<input placeholder="e.g. D major" {...register('musical_key')} /></label><label>Voice classification<select {...register('voice_classification')}><option value="">Not specified</option>{voices.slice(1).map(voice => <option key={voice} value={voice}>{labelCase(voice)}</option>)}</select></label></div>
      <label>Description <span className="optional">Optional</span><textarea rows={3} placeholder="Notes about this arrangement or version" {...register('description')} /></label>
      <fieldset className="relation-fieldset"><legend>Choirs</legend>{choirs.length ? <div className="relation-options">{choirs.map(choir => <label className="check-row" key={choir.id}><input type="checkbox" checked={choirIds.includes(choir.id)} onChange={() => toggle(choir.id, choirIds, setChoirIds)} /><i style={{ backgroundColor: choir.color }} />{choir.name}</label>)}</div> : <p className="form-note">Create a choir first, or add this song without a choir.</p>}</fieldset>
      <fieldset className="relation-fieldset"><legend>Categories</legend>{categories.length ? <div className="relation-options">{categories.map(category => <label className="check-row" key={category.id}><input type="checkbox" checked={categoryIds.includes(category.id)} onChange={() => toggle(category.id, categoryIds, setCategoryIds)} />{category.name}</label>)}</div> : <p className="form-note">Create categories with the Manage categories control on the library page.</p>}</fieldset>
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>Cancel</button><button className="button-primary" disabled={isSubmitting}>{song ? 'Save changes' : 'Add to library'}</button></div>
    </form>
  </section></div>
}

function CategoryManager({ categories, onCreate, onDelete }: { categories: SongCategory[]; onCreate: (name: string) => void; onDelete: (category: SongCategory) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  return <section className={`category-manager ${open ? 'category-manager-open' : ''}`}><button className="category-manager-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}><span>Manage categories</span><span>{categories.length} saved</span><span>{open ? '−' : '+'}</span></button>{open && <div className="category-manager-body"><form onSubmit={event => { event.preventDefault(); if (name.trim()) { onCreate(name.trim()); setName('') } }}><input aria-label="New category name" placeholder="Add a category, e.g. Hymn" value={name} onChange={event => setName(event.target.value)} maxLength={60} required /><button className="button-secondary" disabled={!name.trim()}><Plus size={13} /> Add</button></form><div className="category-chip-list">{categories.map(category => <span className="managed-category" key={category.id}>{category.name}<button aria-label={`Delete ${category.name}`} onClick={() => onDelete(category)}>×</button></span>)}{!categories.length && <small>Custom categories help you organize your own repertoire.</small>}</div></div>}</section>
}

function MaterialManager({ song, onChange }: { song: Song; onChange: () => void }) {
  const [materials, setMaterials] = useState<SongAttachment[]>([])
  const [kind, setKind] = useState<MaterialKind>('pdf')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function load() {
    try { const { data } = await api.get<SongAttachment[]>(`/songs/${song.id}/attachments/`); setMaterials(data) }
    catch { setError('Learning materials could not be loaded.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [song.id])
  async function addMaterial(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setNotice(''); setSaving(true)
    try {
      if (kind === 'youtube') {
        await api.post(`/songs/${song.id}/attachments/`, { kind, url: youtubeUrl.trim() })
        setYoutubeUrl('')
      } else {
        if (!files.length) { setError('Choose one or more files first.'); return }
        for (const file of files) {
          const form = new FormData(); form.append('kind', kind); form.append('file', file)
          await api.post(`/songs/${song.id}/attachments/`, form)
        }
        setFiles([])
      }
      await load(); onChange(); setNotice('Learning material added.')
    } catch (e) { await load(); onChange(); setError(apiError(e, 'The material could not be uploaded. Check the file and try again.')) }
    finally { setSaving(false) }
  }
  async function removeMaterial(material: SongAttachment) {
    if (!window.confirm(`Delete “${material.title}”?`)) return
    try { await api.delete(`/attachments/${material.id}/`); await load(); onChange() }
    catch { setError('The material could not be deleted.') }
  }
  async function replaceFile(material: SongAttachment, file: File) {
    setError(''); setNotice('')
    const form = new FormData(); form.append('file', file)
    try { await api.patch(`/attachments/${material.id}/`, form); await load(); onChange(); setNotice('File replaced.') }
    catch (e) { setError(apiError(e, 'The file could not be replaced.')) }
  }
  async function openMaterial(material: SongAttachment) {
    if (material.kind === 'youtube') { window.open(material.url, '_blank', 'noopener,noreferrer'); return }
    const tab = window.open('about:blank', '_blank')
    if (!tab) { setError('Allow pop-ups to open learning materials.'); return }
    tab.opener = null
    try {
      const { data } = await api.get(`/attachments/${material.id}/file/`, { responseType: 'blob' })
      const objectUrl = URL.createObjectURL(data)
      tab.location.href = objectUrl
      tab.addEventListener('pagehide', () => URL.revokeObjectURL(objectUrl), { once: true })
    } catch { tab.close(); setError('This learning material could not be opened.') }
  }
  const accept = kind === 'pdf' ? '.pdf,application/pdf' : kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm,video/quicktime,.m4v'
  return <section className="material-section"><div className="material-section-title"><div><p className="eyebrow">LEARNING MATERIALS</p><h4>Materials <span>{materials.length}</span></h4></div></div>
    {error && <div className="material-error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}{notice && <div className="material-notice" role="status">{notice}</div>}
    {loading ? <div className="material-loading">Loading materials…</div> : materials.length ? <div className="material-list">{materials.map(material => <MaterialRow key={material.id} material={material} onOpen={() => void openMaterial(material)} onDelete={() => void removeMaterial(material)} onReplace={file => void replaceFile(material, file)} />)}</div> : <p className="no-materials">No materials yet. Add sheet music, page images, or a rehearsal video.</p>}
    <form className="material-add-form" onSubmit={event => void addMaterial(event)}><div className="material-add-heading"><strong>Add learning material</strong><span>Upload size limit is set by your server administrator.</span></div><div className="material-add-fields"><select aria-label="Material type" value={kind} onChange={event => { setKind(event.target.value as MaterialKind); setFiles([]) }}><option value="pdf">PDF sheet music</option><option value="image">Image pages</option><option value="youtube">YouTube link</option><option value="video">Rehearsal video</option></select>{kind === 'youtube' ? <input type="url" placeholder="https://youtu.be/..." value={youtubeUrl} onChange={event => setYoutubeUrl(event.target.value)} required /> : <label className="material-file-input">{files.length ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : kind === 'image' ? 'Choose image pages' : 'Choose a file'}<input type="file" accept={accept} multiple={kind === 'image'} onChange={event => setFiles(Array.from(event.target.files || []))} required /></label>}<button className="button-primary" disabled={saving}>{saving ? 'Adding…' : 'Add'}</button></div></form>
  </section>
}

function MaterialRow({ material, onOpen, onDelete, onReplace }: { material: SongAttachment; onOpen: () => void; onDelete: () => void; onReplace: (file: File) => void }) {
  const [editingUrl, setEditingUrl] = useState(false)
  const [url, setUrl] = useState(material.url)
  const [title, setTitle] = useState(material.title)
  const [error, setError] = useState('')
  const Icon = material.kind === 'pdf' ? FileMusic : material.kind === 'image' ? FileImage : material.kind === 'video' ? Film : Link2
  async function saveLink(event: React.FormEvent) {
    event.preventDefault(); setError('')
    try { await api.patch(`/attachments/${material.id}/`, { url: url.trim(), title: title.trim() }); setEditingUrl(false) }
    catch (e) { setError(apiError(e, 'The link could not be updated.')) }
  }
  return <div className="material-row"><span className={`material-kind-icon kind-${material.kind}`}><Icon size={15} /></span><div className="material-info">{editingUrl ? <form className="youtube-edit" onSubmit={event => void saveLink(event)}><input aria-label="Material title" value={title} onChange={event => setTitle(event.target.value)} /><input aria-label="YouTube URL" type="url" value={url} onChange={event => setUrl(event.target.value)} required /><button className="button-secondary">Save</button><button type="button" className="text-action" onClick={() => setEditingUrl(false)}>Cancel</button>{error && <small className="field-error">{error}</small>}</form> : <><strong>{title || material.title}</strong><small>{material.kind === 'youtube' ? url : material.file_name}</small></>}</div><div className="material-row-actions">{material.kind === 'youtube' && <button className="text-action" onClick={() => setEditingUrl(true)}>Edit link</button>}{material.kind !== 'youtube' && <label className="replace-material">Replace<input type="file" accept={material.kind === 'pdf' ? '.pdf' : material.kind === 'image' ? 'image/jpeg,image/png,image/webp' : 'video/mp4,video/webm,video/quicktime,.m4v'} onChange={event => { const file = event.target.files?.[0]; if (file) onReplace(file); event.currentTarget.value = '' }} /></label>}<button className="text-action" onClick={onOpen}>Open</button><button className="material-delete" onClick={onDelete} aria-label={`Delete ${material.title}`}><Trash2 size={14} /></button></div></div>
}

function apiError(error: any, fallback: string) {
  const detail = error.response?.data
  if (typeof detail === 'string') return detail
  return Object.values(detail || {}).flat().filter(value => typeof value === 'string').join(' ') || fallback
}
function labelCase(value: string) { return value ? value[0].toUpperCase() + value.slice(1) : '' }
