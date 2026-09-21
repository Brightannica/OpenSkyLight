import { DateTime } from 'luxon'
import { openDatabaseAsync } from '../db/client'
import { createSettingsService } from '../services/settingsService'
import { createPeopleService } from '../services/peopleService'
import { createCalendarService } from '../services/calendarService'
import { createEventService } from '../services/eventService'
import { buildChannelTable, dispatch, type ChannelTable, type Services } from '../ipc/router'
import { createWeatherService } from '../services/weatherService'
import { createAuthService } from '../services/authService'
import { createChoresService } from '../services/choresService'
import { createRewardsService } from '../services/rewardsService'
import { createListsService } from '../services/listsService'
import { createMealsService } from '../services/mealsService'
import { createRssService } from '../services/rssService'
import { createBirdNetService } from '../services/birdnetService'
import { createGoogleAuth } from '../sync/googleAuth'
import { createGoogleSync } from '../sync/googleSync'
import { createOutboxWorker } from '../sync/outboxWorker'
import { createIcsSync } from '../sync/icsSync'
import { createSyncManager } from '../sync/scheduler'
import type { IpcChannel, IpcResult } from '@shared/ipc/contract'

export interface WebServicesContext {
  services: Services
  channelTable: ChannelTable
  dispatch: (channel: IpcChannel, payload: unknown, gate?: 'pin' | 'none') => Promise<IpcResult<unknown>>
}

let cachedContext: WebServicesContext | null = null
let initPromise: Promise<WebServicesContext> | null = null

export async function getWebServices(): Promise<WebServicesContext> {
  if (cachedContext) return cachedContext
  if (initPromise) return initPromise

  initPromise = (async () => {
    const dbHandle = await openDatabaseAsync(process.env.DB_PATH || 'openskylight.db')
    const db = dbHandle.db
    const deviceTz = (): string => DateTime.local().zoneName ?? 'UTC'

    const settings = createSettingsService(db)

    const kioskStub: any = {
      setLaunchOnStartup: () => {},
      pickFolder: async () => null,
      listPhotos: async () => [],
      previewScreensaver: () => {},
      start: () => {},
      stop: () => {}
    }

    const updaterStub: any = {
      quitAndInstall: () => {},
      start: () => {}
    }

    const cameraStub: any = {
      list: () => [],
      add: () => { throw new Error('RTSP Camera streaming is only supported in desktop kiosk mode') },
      remove: () => {},
      start: () => { throw new Error('RTSP Camera streaming is only supported in desktop kiosk mode') },
      stop: () => {},
      shutdown: () => {}
    }

    const companionStub: any = {
      applySettings: () => {},
      getStatus: () => ({ running: false, port: 0, urls: [], pairedCount: 0, lastError: null }),
      issueToken: () => ({ url: '' }),
      unpairAll: () => {},
      stop: () => {},
      shutdown: () => {}
    }

    const choresService = createChoresService(db, deviceTz)
    const googleAuth = createGoogleAuth(db, settings)
    const googleSync = createGoogleSync({ db, auth: googleAuth, deviceTz })
    const outbox = createOutboxWorker({
      db,
      sync: googleSync,
      onConflict: () => {}
    })
    const icsSync = createIcsSync({ db, deviceTz })
    const syncManager = createSyncManager({
      db,
      auth: googleAuth,
      google: googleSync,
      outbox,
      ics: icsSync,
      broadcast: () => {}
    })

    const services: Services = {
      settings,
      people: createPeopleService(db),
      calendars: createCalendarService(db),
      events: createEventService(db),
      googleAuth,
      googleSync,
      icsSync,
      syncManager,
      weather: createWeatherService(settings),
      auth: createAuthService(settings),
      chores: choresService,
      rewards: createRewardsService(db, choresService),
      lists: createListsService(db),
      meals: createMealsService(db),
      kiosk: kioskStub,
      updater: updaterStub,
      rss: createRssService(),
      camera: cameraStub,
      birdnet: createBirdNetService(),
      companion: companionStub
    }

    const channelTable = buildChannelTable(services)

    const context: WebServicesContext = {
      services,
      channelTable,
      dispatch: (channel, payload, gate = 'none') =>
        dispatch(services, channelTable, channel, payload, { gate })
    }

    cachedContext = context
    return context
  })()

  return initPromise
}
