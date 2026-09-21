import type { SettingsService } from './settingsService'

/** Open-Meteo: no API key, generous free tier. https://open-meteo.com */

export interface WeatherDaily {
  date: string
  code: number
  high: number
  low: number
  precipProb: number | null
}

export interface WeatherDto {
  temperature: number
  code: number
  isDay: boolean
  unit: 'f' | 'c'
  label: string
  daily: WeatherDaily[]
  fetchedAt: string
}

export interface CityResult {
  label: string
  lat: number
  lon: number
}

const CACHE_TTL_MS = 10 * 60 * 1000

export function createWeatherService(settings: SettingsService) {
  let cache: { key: string; data: WeatherDto; atMs: number } | null = null

  async function get(): Promise<WeatherDto | null> {
    const s = await settings.getAll()
    if (!s.weather) return null
    const unit = s.temperatureUnit
    const key = `${s.weather.lat},${s.weather.lon},${unit}`
    if (cache && cache.key === key && Date.now() - cache.atMs < CACHE_TTL_MS) return cache.data

    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${s.weather.lat}&longitude=${s.weather.lon}` +
      '&current=temperature_2m,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      `&temperature_unit=${unit === 'f' ? 'fahrenheit' : 'celsius'}` +
      '&timezone=auto&forecast_days=5'
    const res = await fetch(url)
    if (!res.ok) {
      // serve stale data over an error if we have any
      if (cache && cache.key === key) return cache.data
      throw new Error(`Weather service returned HTTP ${res.status}`)
    }
    const body = (await res.json()) as {
      current: { temperature_2m: number; weather_code: number; is_day: number }
      daily: {
        time: string[]
        weather_code: number[]
        temperature_2m_max: number[]
        temperature_2m_min: number[]
        precipitation_probability_max: (number | null)[]
      }
    }
    const data: WeatherDto = {
      temperature: Math.round(body.current.temperature_2m),
      code: body.current.weather_code,
      isDay: body.current.is_day === 1,
      unit,
      label: s.weather.label,
      daily: body.daily.time.map((date, i) => ({
        date,
        code: body.daily.weather_code[i],
        high: Math.round(body.daily.temperature_2m_max[i]),
        low: Math.round(body.daily.temperature_2m_min[i]),
        precipProb: body.daily.precipitation_probability_max[i] ?? null
      })),
      fetchedAt: new Date().toISOString()
    }
    cache = { key, data, atMs: Date.now() }
    return data
  }

  async function searchCity(query: string): Promise<CityResult[]> {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=8&language=en&format=json`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Geocoding returned HTTP ${res.status}`)
    const body = (await res.json()) as {
      results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[]
    }
    return (body.results ?? []).map((r) => ({
      label: [r.name, r.admin1 ?? r.country].filter(Boolean).join(', '),
      lat: r.latitude,
      lon: r.longitude
    }))
  }

  return { get, searchCity }
}

export type WeatherService = ReturnType<typeof createWeatherService>
