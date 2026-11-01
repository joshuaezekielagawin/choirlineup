import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, type ChoirEvent } from './api'
import { PracticePage, readYouTubePosition } from './Practice'
import { Workspace } from './Workspace'

vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } }))

const event: ChoirEvent = {
  id: 31, title: 'Spring Concert', choir: { id: 12, name: 'Riverside Choir', color: '#728b72' }, date: '2026-12-12', start_time: '19:00:00', end_time: '21:00:00', venue: '', description: '', preparation_deadline: null, status: 'preparing', lineup_count: 2, ready_count: 0, created_at: '', updated_at: '',
  lineup: [
    { id: 70, song: { id: 4, title: 'First Song', composer_artist: '' }, position: 1, purpose: 'opening', assigned_voice_part: '', special_instructions: '', practice_notes: 'Review verse two.', preparation_status: 'learning' },
    { id: 71, song: { id: 5, title: 'Second Song', composer_artist: '' }, position: 2, purpose: 'closing', assigned_voice_part: '', special_instructions: '', practice_notes: '', preparation_status: 'not_started' },
  ],
}

describe('practice mode', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() }) })
  afterEach(() => { cleanup(); vi.unstubAllGlobals() })

  it('handles YouTube players before their playback methods are ready', () => {
    expect(readYouTubePosition({ destroy: vi.fn() })).toBeNull()
    expect(readYouTubePosition({ getCurrentTime: () => { throw new Error('player is not ready') } })).toBeNull()
    expect(readYouTubePosition({ getCurrentTime: () => 18.25 })).toBe(18.25)
  })

  it('loads event songs, saves status, and navigates in lineup order', async () => {
    const user = userEvent.setup()
    vi.mocked(api.get).mockImplementation((url: string) => Promise.resolve({ data: url.endsWith('/attachments/') ? [] : event }) as never)
    vi.mocked(api.patch).mockResolvedValue({ data: { ...event.lineup[0], preparation_status: 'practiced' } } as never)
    render(<MemoryRouter initialEntries={['/practice/31/0']}><Routes><Route path="/practice/*" element={<PracticePage />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'First Song' })).toBeInTheDocument()
    expect(screen.getByText('Review verse two.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Practiced' }))
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/lineup-items/70/', { preparation_status: 'practiced' }))
    await user.click(screen.getByRole('button', { name: 'Next song' }))
    expect(await screen.findByRole('heading', { name: 'Second Song' })).toBeInTheDocument()
  })

  it('renders the direct practice URL inside the authenticated workspace', async () => {
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url === '/choirs/') return Promise.resolve({ data: [] }) as never
      if (url === '/events/31/') return Promise.resolve({ data: event }) as never
      if (url.endsWith('/attachments/')) return Promise.resolve({ data: [] }) as never
      return Promise.reject(new Error(`Unexpected API request: ${url}`)) as never
    })
    render(<MemoryRouter initialEntries={['/practice/31/0']}><Workspace user={{ id: 1, email: 'singer@example.test', full_name: 'Test Singer', default_voice: 'alto' }} onUserChange={vi.fn()} onLogout={vi.fn()} /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'First Song' })).toBeInTheDocument()
    expect(screen.getByText('Return to lineup')).toBeInTheDocument()
  })

  it('renders a lineup song with saved YouTube learning material', async () => {
    const material = { id: 9, kind: 'youtube', title: 'Rehearsal', file_url: null, file_name: '', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', position: 0, created_at: '' }
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.endsWith('/attachments/')) return Promise.resolve({ data: [material] }) as never
      if (url.endsWith('/progress/')) return Promise.resolve({ data: { last_page: 1, video_position: 0, updated_at: null } }) as never
      return Promise.resolve({ data: event }) as never
    })
    render(<MemoryRouter initialEntries={['/practice/31/0']}><Routes><Route path="/practice/*" element={<PracticePage />} /></Routes></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: 'First Song' })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: 'YouTube' })).toBeInTheDocument()
    expect(screen.getByRole('tablist', { name: 'Choose a learning material' })).toBeInTheDocument()
  })
})
