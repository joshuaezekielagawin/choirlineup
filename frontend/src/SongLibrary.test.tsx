import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { api, type Choir, type Song } from './api'
import { SongLibraryPage } from './SongLibrary'

vi.mock('./api', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}))

const choir: Choir = {
  id: 42, name: 'Community Voices', description: '', color: '#728b72', voice_classification: 'alto',
  custom_voice: '', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}
const song: Song = {
  id: 7, title: 'Amazing Grace', composer_artist: 'Traditional', language: 'English', musical_key: 'G',
  description: '', voice_classification: 'alto', categories: [], choirs: [{ id: choir.id, name: choir.name, color: choir.color }],
  attachment_count: 0, created_at: '2026-05-01T00:00:00Z', updated_at: '2026-05-01T00:00:00Z',
}

function mockLibraryGet(songList: Song[]) {
  vi.mocked(api.get).mockImplementation((url: string) => Promise.resolve({ data: url === '/song-categories/' ? [] : songList }) as never)
}

describe('song library', () => {
  beforeEach(() => { vi.resetAllMocks() })
  afterEach(() => cleanup())

  it('loads songs and sends title and choir filters to the API', async () => {
    const user = userEvent.setup()
    mockLibraryGet([song])
    render(<SongLibraryPage choirs={[choir]} />)
    expect(await screen.findByText('Amazing Grace')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Search song titles' }), 'Grace')
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/songs/', expect.objectContaining({ params: expect.objectContaining({ search: 'Grace' }) })))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by choir' }), String(choir.id))
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/songs/', expect.objectContaining({ params: expect.objectContaining({ choir: String(choir.id) }) })))
  })

  it('creates a song and includes the selected choir relationship', async () => {
    const user = userEvent.setup()
    mockLibraryGet([])
    vi.mocked(api.post).mockResolvedValue({ data: song } as never)
    render(<SongLibraryPage choirs={[choir]} />)
    await user.click((await screen.findAllByRole('button', { name: 'Add song' }))[0])
    await user.type(screen.getByRole('textbox', { name: 'Song title' }), 'Amazing Grace')
    await user.click(screen.getByRole('checkbox', { name: choir.name }))
    await user.click(screen.getByRole('button', { name: 'Add to library' }))

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/songs/', expect.objectContaining({
      title: 'Amazing Grace', choir_ids: [choir.id], category_ids: [],
    })))
    expect(await screen.findByRole('status')).toHaveTextContent('Song added to your library.')
  })
})
