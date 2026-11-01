import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('choirlineup-token')
  if (token) config.headers.Authorization = `Token ${token}`
  return config
})

export type User = { id: number; email: string; full_name: string; default_voice: string; profile_picture_url?: string | null }
export type AuthResponse = { token: string; user: User }
export type Choir = {
  id: number
  name: string
  description: string
  color: string
  voice_classification: string
  custom_voice: string
  created_at: string
  updated_at: string
}
export type SongCategory = { id: number; name: string; created_at: string }
export type Song = {
  id: number
  title: string
  composer_artist: string
  language: string
  musical_key: string
  description: string
  voice_classification: string
  categories: SongCategory[]
  choirs: Pick<Choir, 'id' | 'name' | 'color'>[]
  attachment_count: number
  created_at: string
  updated_at: string
}
export type SongAttachment = {
  id: number
  kind: 'pdf' | 'image' | 'youtube' | 'video'
  title: string
  file_url: string | null
  file_name: string
  url: string
  position: number
  created_at: string
}
export type EventLineupItem = {
  id: number
  song: Pick<Song, 'id' | 'title' | 'composer_artist'>
  position: number
  purpose: 'opening' | 'worship' | 'communion' | 'closing' | 'special_music' | 'other'
  assigned_voice_part: string
  special_instructions: string
  practice_notes: string
  preparation_status: 'not_started' | 'learning' | 'practiced' | 'ready'
}
export type ChoirEvent = {
  id: number
  title: string
  choir: Pick<Choir, 'id' | 'name' | 'color'>
  date: string
  start_time: string
  end_time: string
  venue: string
  description: string
  preparation_deadline: string | null
  status: 'upcoming' | 'preparing' | 'completed' | 'cancelled'
  lineup: EventLineupItem[]
  lineup_count: number
  ready_count: number
  created_at: string
  updated_at: string
}
