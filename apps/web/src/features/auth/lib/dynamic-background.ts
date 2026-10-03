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

/** 自适应随机图直连端点（仅作展示降级用，不可读像素）。 */
export const RANDOM_BACKGROUND_URL = 'https://img-pic-api.072168.xyz/ua'

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

/**
 * 加载随机背景图：成功后回调展示 URL，并用 matugen 同源算法
 * （sourceColorFromImage → themeFromSourceColor）生成动态配色。
 * 图片加载或取色失败时静默放弃，页面保持静态主题，无任何副作用。
 */
export function loadRandomBackground(
  scope: HTMLElement,
  onUrl: (url: string) => void
): () => void {
  let cancelled = false
  const controller = new AbortController()

  const startImageLoad = (src: string, withColor: boolean): void => {
    if (cancelled) return
    const image = new Image()
    // 仅在需要读取像素时启用 CORS 模式；纯展示加载无需 crossOrigin。
    if (withColor) image.crossOrigin = 'anonymous'

    image.addEventListener(
      'load',
      () => {
        if (cancelled) return
        scope.setAttribute('data-has-bg', '')
        onUrl(image.currentSrc || image.src)
        if (!withColor) return
        try {
          // 限制采样像素数，避免量化高清背景时阻塞登录表单。
          const canvas = document.createElement('canvas')
          const scale = Math.min(1, 128 / Math.max(image.naturalWidth, image.naturalHeight))
          canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
          canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
          const context = canvas.getContext('2d')
          if (!context) return
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
          const argb = sourceColorFromImageBytes(pixels)
          applyDynamicRoles(scope, rolesFromTheme(themeFromSourceColor(argb)))
        } catch {
          // 像素不可读时保留背景与静态配色。
        }
      },
      { once: true }
    )
    // 加载失败时静默放弃：无背景图、无动态配色，页面保持静态主题。
    image.addEventListener('error', () => {}, { once: true })

    image.src = src
  }

  // 不能直连 /ua 读像素：其 302 首跳不带 CORS 头（crossOrigin 模式要求每跳
  // 通过检查），且带任何查询串会直接返回文档页。因此先经查询端点
  // （自身 ACAO:*）解析出最终图片 URL，再单跳直载 /images/*（同样 ACAO:*）；
  // 查询失败则直连 /ua 仅作展示降级（不取色）。
  fetch(`${RANDOM_BACKGROUND_API}/?type=ua&format=text`, {
    cache: 'no-store',
    signal: controller.signal,
  })
    .then((response) =>
      response.ok ? response.text() : Promise.reject(new Error())
    )
    .then((text) => {
      if (cancelled) return
      const url = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.startsWith('http'))
      if (!url) {
        throw new Error('no image url in response')
      }
      startImageLoad(url, true)
    })
    .catch(() => {
      if (!cancelled) startImageLoad(RANDOM_BACKGROUND_URL, false)
    })

  return () => {
    cancelled = true
    controller.abort()
  }
}
