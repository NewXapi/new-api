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
  sourceColorFromImage,
  themeFromSourceColor,
  type Theme,
} from '@material/material-color-utilities'

/** 自适应随机图端点（按屏幕方向返回横/竖图）。 */
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
  const image = new Image()
  image.crossOrigin = 'anonymous'

  const handleLoad = () => {
    if (cancelled) return
    scope.setAttribute('data-has-bg', '')
    onUrl(image.currentSrc || image.src)
    sourceColorFromImage(image)
      .then((argb) => {
        if (cancelled) return
        applyDynamicRoles(scope, rolesFromTheme(themeFromSourceColor(argb)))
      })
      .catch(() => {
        // 取像素失败（如 CORS 变化）时保留静态主题。
      })
  }

  image.addEventListener('load', handleLoad, { once: true })
  // 加载失败时静默放弃：无背景图、无动态配色，页面保持静态主题。
  image.addEventListener('error', () => {}, { once: true })

  image.src = `${RANDOM_BACKGROUND_URL}?_=${Date.now()}`

  return () => {
    cancelled = true
    image.removeEventListener('load', handleLoad)
  }
}
