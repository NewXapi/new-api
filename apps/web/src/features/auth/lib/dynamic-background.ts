/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  hexFromArgb,
  sourceColorFromImageBytes,
  themeFromSourceColor,
  type Theme,
} from '@material/material-color-utilities'

/**
 * 随机图查询端点：`/api/?type=ua&format=text` 返回一条最终图片 URL 的纯文本。
 * 自身带 Access-Control-Allow-Origin:*，可安全用 fetch 读取。
 */
export const RANDOM_BACKGROUND_API = 'https://img-pic-api.072168.xyz/api'

/**
 * 新版 Scheme 类型才包含 surface-container 系列角色，旧类型没有；
 * 因此通过宽松的 record 读取并逐角色回退，避免对打包版本产生硬依赖。
 */
type SchemeLike = Record<string, number | undefined>

const role = (scheme: SchemeLike, key: string, fallback: string): string => {
  const value = scheme[key]
  return hexFromArgb(typeof value === 'number' ? value : (scheme[fallback] as number))
}

export type DynamicRoles = {
  light: Record<string, string>
  dark: Record<string, string>
}

/** 把 material-color-utilities 的 Theme 映射为本项目的 shadcn 令牌角色。 */
export function rolesFromTheme(theme: Theme): DynamicRoles {
  const map = (scheme: SchemeLike): Record<string, string> => ({
    background: role(scheme, 'surface', 'surface'),
    foreground: role(scheme, 'onSurface', 'onSurface'),
    card: role(scheme, 'surfaceContainerLow', 'surface'),
    'card-foreground': role(scheme, 'onSurface', 'onSurface'),
    popover: role(scheme, 'surfaceContainer', 'surface'),
    'popover-foreground': role(scheme, 'onSurface', 'onSurface'),
    primary: role(scheme, 'primary', 'primary'),
    'primary-foreground': role(scheme, 'onPrimary', 'onPrimary'),
    secondary: role(scheme, 'secondaryContainer', 'secondaryContainer'),
    'secondary-foreground': role(scheme, 'onSecondaryContainer', 'onPrimary'),
    muted: role(scheme, 'surfaceContainerHigh', 'surfaceVariant'),
    'muted-foreground': role(scheme, 'onSurfaceVariant', 'onSurfaceVariant'),
    accent: role(scheme, 'primaryContainer', 'primary'),
    'accent-foreground': role(scheme, 'onPrimaryContainer', 'onPrimary'),
    destructive: role(scheme, 'error', 'error'),
    'destructive-foreground': role(scheme, 'onError', 'onError'),
    border: role(scheme, 'outlineVariant', 'outline'),
    input: role(scheme, 'outlineVariant', 'outline'),
    ring: role(scheme, 'primary', 'primary'),
    sidebar: role(scheme, 'surfaceContainerLow', 'surface'),
    'sidebar-foreground': role(scheme, 'onSurface', 'onSurface'),
    'sidebar-accent': role(scheme, 'primaryContainer', 'primary'),
    'sidebar-accent-foreground': role(scheme, 'onPrimaryContainer', 'onPrimary'),
    'sidebar-border': role(scheme, 'outlineVariant', 'outline'),
    'sidebar-ring': role(scheme, 'primary', 'primary'),
  })

  return {
    light: map(theme.schemes.light as unknown as SchemeLike),
    dark: map(theme.schemes.dark as unknown as SchemeLike),
  }
}

/** 把亮/暗两套角色写入作用域元素（--dyn-light-* / --dyn-dark-*）。 */
export function applyDynamicRoles(scope: HTMLElement, roles: DynamicRoles): void {
  for (const [key, value] of Object.entries(roles.light)) {
    scope.style.setProperty(`--dyn-light-${key}`, value)
  }
  for (const [key, value] of Object.entries(roles.dark)) {
    scope.style.setProperty(`--dyn-dark-${key}`, value)
  }
  scope.setAttribute('data-dynamic-theme', '')
}

type BackgroundResource = {
  promise: Promise<HTMLImageElement>
  controller: AbortController
  subscribers: number
  settled: boolean
}

// Root effect replay shares the pending request; successful loads survive navigation.
let backgroundResource: BackgroundResource | undefined

function parseBackgroundUrl(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    try {
      const url = new URL(line.trim())
      if (
        url.origin === 'https://img-pic-api.072168.xyz' &&
        !url.username &&
        !url.password &&
        url.pathname.startsWith('/images/') &&
        url.pathname.length > '/images/'.length &&
        !url.search &&
        !url.hash
      ) {
        return url.href
      }
    } catch {
      // The text endpoint can include blank lines or non-URL text.
    }
  }
  throw new Error('No allowed background image URL')
}

function loadBackgroundImage(
  src: string,
  signal: AbortSignal
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    // Anonymous CORS never sends credentials to this external image origin.
    image.crossOrigin = 'anonymous'
    image.referrerPolicy = 'no-referrer'
    const timeout = window.setTimeout(onError, 12000)

    function cleanup() {
      window.clearTimeout(timeout)
      image.removeEventListener('load', onLoad)
      image.removeEventListener('error', onError)
      signal.removeEventListener('abort', onError)
    }
    function onLoad() {
      cleanup()
      resolve(image)
    }
    function onError() {
      cleanup()
      image.removeAttribute('src')
      reject(new Error('Background image unavailable'))
    }

    image.addEventListener('load', onLoad)
    image.addEventListener('error', onError)
    signal.addEventListener('abort', onError, { once: true })
    if (signal.aborted) {
      onError()
      return
    }
    image.src = src
  })
}

function createBackgroundResource(): BackgroundResource {
  const controller = new AbortController()
  const resource: BackgroundResource = {
    controller,
    subscribers: 0,
    settled: false,
    promise: (async () => {
      const timeout = window.setTimeout(() => controller.abort(), 12000)
      try {
        const response = await fetch(
          `${RANDOM_BACKGROUND_API}/?type=ua&format=text`,
          {
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
            redirect: 'error',
            signal: controller.signal,
          }
        )
        if (!response.ok) throw new Error('Background query unavailable')
        const url = parseBackgroundUrl(await response.text())
        window.clearTimeout(timeout)
        return await loadBackgroundImage(url, controller.signal)
      } catch (error) {
        window.clearTimeout(timeout)
        if (controller.signal.aborted) throw new Error('Background load cancelled')
        throw error
      } finally {
        window.clearTimeout(timeout)
      }
    })(),
  }
  void resource.promise.then(
    () => {
      resource.settled = true
    },
    () => {
      resource.settled = true
      if (backgroundResource === resource) backgroundResource = undefined
    }
  )
  return resource
}

/**
 * Subscribe to one page-lifetime background load. Cleanup prevents stale callbacks
 * and cancels pending work after the last subscriber leaves. Optional material
 * color extraction stays available without changing the shared display request.
 */
export function loadRandomBackground(
  scope: HTMLElement,
  onUrl: (url: string, image: HTMLImageElement) => void,
  dynamicColor = false
): () => void {
  const resource = backgroundResource ??= createBackgroundResource()
  resource.subscribers += 1
  let cancelled = false
  let appliedRoles: DynamicRoles | undefined

  void resource.promise.then((image) => {
    if (cancelled) return
    onUrl(image.currentSrc || image.src, image)
    if (!dynamicColor) return
    try {
      const canvas = document.createElement('canvas')
      const scale = Math.min(1, 128 / Math.max(image.naturalWidth, image.naturalHeight))
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) return
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      appliedRoles = rolesFromTheme(themeFromSourceColor(sourceColorFromImageBytes(pixels)))
      applyDynamicRoles(scope, appliedRoles)
    } catch {
      // Unreadable pixels do not discard the background or static theme.
    }
  }, () => {})

  return () => {
    if (cancelled) return
    cancelled = true
    resource.subscribers -= 1
    if (appliedRoles) {
      for (const mode of ['light', 'dark'] as const) {
        for (const key of Object.keys(appliedRoles[mode])) {
          scope.style.removeProperty(`--dyn-${mode}-${key}`)
        }
      }
      scope.removeAttribute('data-dynamic-theme')
    }
    // React StrictMode re-subscribes synchronously before this microtask runs.
    queueMicrotask(() => {
      if (resource.subscribers === 0 && !resource.settled) {
        resource.controller.abort()
        if (backgroundResource === resource) backgroundResource = undefined
      }
    })
  }
}
