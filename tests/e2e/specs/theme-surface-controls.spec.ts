import { test, expect } from '../fixtures/auth';
import type { Locator, Page } from '@playwright/test';

/**
 * Theme surface axes (Surface opacity / Blur radius / Background scrim) on
 * the public /pricing page, no login. Each axis is driven with real input —
 * pointer press/drag on the Base UI track plus arrow-key steps on the
 * slider's native range input — and asserted on computed effects only (card
 * alpha, image blur, scrim painted alpha), never on CSS variable strings.
 * Values persist via cookies across reload; the section Reset restores the
 * observed initial state. Fresh contexts pin the vite-ui-theme cookie and
 * pre-seed the app's background-image cache with a data URL so the image
 * layer never waits on a slow external host.
 */

const THEME = /Theme management|主题管理/;
// i18n labels: the fresh context runs the English UI (i18next falls back to
// the en-US navigator locale); Chinese alternates keep the locators alive
// for other interface languages.
const SLIDERS = {
  opacity: { label: /Surface opacity|表面不透明度/, cookie: 'theme_surface_opacity' },
  blur: { label: /Blur radius|模糊半径/, cookie: 'theme_surface_blur' },
  scrim: { label: /Background scrim|背景暗底/, cookie: 'theme_bg_scrim' },
} as const;
type Axis = keyof typeof SLIDERS;

// The zero-models pricing page always renders the filter sidebar card
// (xl:block at the 1280 viewport); its background resolves through the
// --card-surface token, i.e. the card color mixed at --surface-opacity.
const CARD = '[data-slot="card"]:has(aside)';
const SCRIM = '[data-slot="app-background-scrim"]';
const QUANTUM = 2 / 255; // 8-bit canvas quantization slack for painted alphas
// 1×1 gray PNG in the app's background-cache shape ({ url, dataUrl }); it
// paints instantly and the remote refresh may fail without blanking the page.
const SEED = {
  url: '',
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==',
};

async function setup(page: Page, theme: 'dark' | 'light') {
  await page.context().clearCookies();
  await page.context().addCookies([
    { name: 'vite-ui-theme', value: theme, url: process.env.BASE_URL ?? 'http://localhost:5173' },
  ]);
  // Seed only when the app has no valid cached image of its own.
  await page.addInitScript((key: string, seed: object) => {
    let cached: { dataUrl?: string } | null = null;
    try {
      cached = JSON.parse(window.localStorage.getItem(key) ?? 'null');
    } catch {
      cached = null;
    }
    if (!cached?.dataUrl?.startsWith('data:image/')) {
      window.localStorage.setItem(key, JSON.stringify(seed));
    }
  }, 'app-background-image', SEED);
}

// App readiness from visible elements, never networkidle or sleeps.
async function ready(page: Page, needImage = false) {
  await expect(page.getByRole('heading', { name: /Model Square|模型广场/ })).toBeVisible();
  await expect(page.getByRole('button', { name: THEME })).toBeVisible();
  if (needImage) {
    // body marks the background layer as painted; with the seeded cache
    // this resolves almost instantly.
    await expect(page.locator('body')).toHaveAttribute('data-app-background', 'true', {
      timeout: 30_000,
    });
  }
}

async function openDrawer(page: Page): Promise<Locator> {
  await page.getByRole('button', { name: THEME }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  return drawer;
}

// Per-axis handles into the open drawer: the role slider (the native range
// input is Base UI's focus/keyboard proxy), the live readout span, and the
// visible track that receives pointer input.
function ctrl(page: Page, drawer: Locator) {
  const tr = (a: Axis) =>
    drawer
      .getByRole('slider', { name: SLIDERS[a].label })
      .locator('xpath=ancestor::*[@data-slot="slider"][1]');
  const readout = (a: Axis) =>
    drawer.locator('div.rounded-lg.border').filter({ hasText: SLIDERS[a].label }).locator('span').last();
  const value = async (a: Axis) =>
    Number(await drawer.getByRole('slider', { name: SLIDERS[a].label }).inputValue());
  const cookie = (a: Axis) =>
    page.evaluate(
      (name: string) => {
        const entry = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
        return entry ? entry.slice(name.length + 1) : null;
      },
      SLIDERS[a].cookie
    );

  // A press on the track away from the thumb jumps the value to the
  // pressed position (edge-aligned thumb math, rounded to the step).
  async function press(a: Axis, fraction: number) {
    const { x, y, w, h } = await tr(a).evaluate((el) => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    await page.mouse.move(x + w * fraction, y + h / 2);
    await page.mouse.down();
    await page.mouse.up();
  }

  // Dragging the thumb past a track edge: its center follows the pointer
  // and Base UI clamps, so the value lands exactly on min or max.
  async function dragEdge(a: Axis, edge: 'start' | 'end') {
    const { x, w, tx, ty, tw } = await tr(a).evaluate((el) => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const t = el.querySelector('[data-slot="slider-thumb"]')!.getBoundingClientRect();
      return { x: r.x, w: r.width, tx: t.x, ty: t.y, tw: t.width };
    });
    const y = ty + 6;
    await page.mouse.move(tx + tw / 2, y);
    await page.mouse.down();
    await page.mouse.move(edge === 'end' ? x + w + 24 : x - 24, y, { steps: 12 });
    await page.mouse.up();
  }

  // One arrow-key press moves the value one step.
  async function step(a: Axis, target: number) {
    const input = drawer.getByRole('slider', { name: SLIDERS[a].label });
    const current = await value(a);
    const key = target > current ? 'ArrowRight' : 'ArrowLeft';
    for (let i = Math.abs(target - current); i > 0; i--) {
      await input.press(key);
    }
    await expect(input).toHaveValue(String(target));
  }

  return { readout, value, cookie, press, dragEdge, step };
}

// Painted background alpha, sampled through the browser's own color pipeline
// (8-bit canvas quantization); agnostic to rgba/oklch/color(srgb...)
// serialization, which is not a user-visible effect.
async function alphaOf(page: Page, selector: string) {
  const alpha = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) return -1;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return -1;
    ctx.fillStyle = getComputedStyle(el).backgroundColor;
    ctx.fillRect(0, 0, 2, 2);
    return ctx.getImageData(1, 1, 1, 1).data[3] / 255;
  }, selector);
  expect(alpha, `no element matching ${selector}`).toBeGreaterThanOrEqual(0);
  return alpha;
}

function alphaNear(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(QUANTUM);
}

// The blur radius the background image is actually painted with.
async function blurPx(page: Page) {
  const px = await page.evaluate(() => {
    const img = document.querySelector('[data-app-background-image]');
    if (!img) return -1;
    const m = getComputedStyle(img).filter.match(/blur\((\d+(?:\.\d+)?)px\)/);
    return m ? Number(m[1]) : -1;
  });
  expect(px, 'background image layer missing').toBeGreaterThanOrEqual(0);
  return px;
}

async function cardBackdropBlurPx(page: Page) {
  return page.locator(CARD).evaluate((card) => {
    const match = getComputedStyle(card).backdropFilter.match(/blur\((\d+(?:\.\d+)?)px\)/)
    return match ? Number(match[1]) : 0
  })
}

test.describe('theme surface controls', () => {
  test('surface opacity drives card alpha: press, keyboard, persist, reset', async ({
    page,
  }) => {
    await setup(page, 'dark');
    await page.goto('/pricing');
    await ready(page);

    const c = ctrl(page, await openDrawer(page));
    const init = {
      opacity: (await c.readout('opacity').textContent())!.trim(),
      scrim: (await c.readout('scrim').textContent())!.trim(),
      alpha: await alphaOf(page, CARD),
    };
    // Dark default: near-solid 80% panels over the heavy scrim. The axis
    // must stay adjustable in both directions from there.
    alphaNear(init.alpha, 0.8);

    // Pointer press at ~30% of the track, then keyboard to exactly 30.
    await c.press('opacity', 0.3);
    await expect(c.readout('opacity')).toHaveText(/^(2[5-9]|3[0-9]|4[0-2])%$/);
    alphaNear(await alphaOf(page, CARD), (await c.value('opacity')) / 100);
    await c.step('opacity', 30);
    await expect(c.readout('opacity')).toHaveText('30%');
    alphaNear(await alphaOf(page, CARD), 0.3);
    expect(await c.cookie('opacity')).toBe('30');

    // Reload: the cookie restores the value and the effect recomputes from
    // it.
    await page.reload();
    await ready(page);
    const c2 = ctrl(page, await openDrawer(page));
    await expect(c2.readout('opacity')).toHaveText('30%');
    alphaNear(await alphaOf(page, CARD), 0.3);

    // Drag up to the max, then section Reset restores the observed initial
    // state and clears the axis cookie.
    await c2.dragEdge('opacity', 'end');
    await expect(c2.readout('opacity')).toHaveText('100%');
    expect(await alphaOf(page, CARD)).toBe(1);
    await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(c2.readout('opacity')).toHaveText(init.opacity);
    await expect(c2.readout('scrim')).toHaveText(init.scrim);
    alphaNear(await alphaOf(page, CARD), init.alpha);
    expect(await c2.cookie('opacity')).toBeNull();

    // Defaults are per color scheme now: flip the theme cookie and reload;
    // the surface recomputes from the light palette's own preset —
    // 50% card glass over a light 30% veil.
    await page.evaluate(() => {
      document.cookie = 'vite-ui-theme=light; path=/';
    });
    await page.reload();
    await ready(page);
    await expect(page.locator('html')).toHaveClass(/light/);
    alphaNear(await alphaOf(page, CARD), 0.5);
    alphaNear(await alphaOf(page, SCRIM), 0.3);
    const c3 = ctrl(page, await openDrawer(page));
    await expect(c3.readout('opacity')).toHaveText('50%');
    await expect(c3.readout('blur')).toHaveText('2px');
    await expect(c3.readout('scrim')).toHaveText('30%');
  });

  test('blur radius drives the background image filter: keyboard, drag, reset', async ({
    page,
  }) => {
    test.setTimeout(90_000)
    await setup(page, 'dark');
    await page.goto('/pricing');
    await ready(page, true);

    const c = ctrl(page, await openDrawer(page));
    const init = {
      readout: (await c.readout('blur').textContent())!.trim(),
      px: await blurPx(page),
    };
    const cardBlurToggle = page.getByRole('dialog').getByRole('switch', { name: /Enable card blur|启用卡片模糊/ })
    expect(await cardBackdropBlurPx(page)).toBe(0)
    await cardBlurToggle.click()
    await expect(cardBlurToggle).toHaveAttribute('aria-checked', 'true')
    expect(await cardBackdropBlurPx(page)).toBeGreaterThan(0)
    expect(await blurPx(page)).toBe(init.px)

    // Keyboard: twelve steps up (2 -> 14 with the current defaults, within
    // the 0..40 range).
    const target = (await c.value('blur')) + 12;
    await c.step('blur', target);
    expect(await blurPx(page)).toBe(target);
    await expect(c.readout('blur')).toHaveText(`${target}px`);

    // Pointer: dragging the thumb past the start edge clamps to 0, i.e. no
    // blur on the background image.
    await c.dragEdge('blur', 'start');
    await expect(c.readout('blur')).toHaveText('0px');
    expect(await blurPx(page)).toBe(0);
    expect(await c.cookie('blur')).toBe('0');
    expect(await cardBackdropBlurPx(page)).toBeGreaterThan(0)

    // Reload: the explicit zero persists.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await ready(page, true);
    const c2 = ctrl(page, await openDrawer(page));
    await expect(c2.readout('blur')).toHaveText('0px');
    expect(await blurPx(page)).toBe(0);
    expect(await cardBackdropBlurPx(page)).toBeGreaterThan(0)
    const persistedToggle = page.getByRole('dialog').getByRole('switch', { name: /Enable card blur|启用卡片模糊/ })
    await expect(persistedToggle).toHaveAttribute('aria-checked', 'true')
    await persistedToggle.click()
    expect(await cardBackdropBlurPx(page)).toBe(0)
    expect(await blurPx(page)).toBe(0)

    await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(c2.readout('blur')).toHaveText(init.readout);
    expect(await blurPx(page)).toBe(init.px);
    expect(await c2.cookie('blur')).toBeNull();
  });

  test('background scrim: the scrim layer paints 20 / 0 / 100, persists and resets', async ({
    page,
  }) => {
    await setup(page, 'dark');
    await page.goto('/pricing');
    await ready(page);

    const c = ctrl(page, await openDrawer(page));
    const init = {
      scrim: (await c.readout('scrim').textContent())!.trim(),
      opacity: (await c.readout('opacity').textContent())!.trim(),
      alpha: await alphaOf(page, SCRIM),
    };
    // Dark preset scrim: the heavy 80% underlay is an intended non-zero
    // default, exact rather than "above some floor".
    await expect(c.readout('scrim')).toHaveText('80%');
    alphaNear(init.alpha, 0.8);

    // Pointer press near the 20% mark: the painted alpha follows the value
    // that press actually lands on.
    await c.press('scrim', 0.2);
    await expect(c.readout('scrim')).toHaveText(/^(1[5-9]|2[0-5])%$/);
    alphaNear(await alphaOf(page, SCRIM), (await c.value('scrim')) / 100);

    await c.step('scrim', 20);
    await expect(c.readout('scrim')).toHaveText('20%');
    alphaNear(await alphaOf(page, SCRIM), 0.2);
    expect(await c.cookie('scrim')).toBe('20');

    await c.step('scrim', 0); // intended zero -> transparent layer
    await expect(c.readout('scrim')).toHaveText('0%');
    expect(await alphaOf(page, SCRIM)).toBe(0);

    await c.dragEdge('scrim', 'end'); // -> 100, fully opaque layer
    await expect(c.readout('scrim')).toHaveText('100%');
    expect(await alphaOf(page, SCRIM)).toBe(1);
    expect(await c.cookie('scrim')).toBe('100');

    await page.reload();
    await ready(page);
    const c2 = ctrl(page, await openDrawer(page));
    await expect(c2.readout('scrim')).toHaveText('100%');
    expect(await alphaOf(page, SCRIM)).toBe(1);

    await page.getByRole('dialog').getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(c2.readout('scrim')).toHaveText(init.scrim);
    await expect(c2.readout('opacity')).toHaveText(init.opacity);
    alphaNear(await alphaOf(page, SCRIM), init.alpha);
    expect(await c2.cookie('scrim')).toBeNull();
  });
});
