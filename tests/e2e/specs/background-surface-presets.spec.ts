import { test, expect } from '../fixtures/auth';
import type { Locator, Page } from '@playwright/test';

/**
 * Surface presets and header legibility with the app background image
 * active. Pins the shipped per-scheme defaults (light 50% card glass with
 * card blur on over a 30% veil, dark 80% panels over an 80% scrim, both
 * 2px blur) with no user cookies, the nav text/icon shadows that keep the
 * header readable over the photo, and the console title band painting no
 * surface layer of its own.
 *
 * The console checks run against the shared dev instance's super-admin via
 * the auth fixture (override with E2E_ADMIN_USERNAME / E2E_ADMIN_PASSWORD).
 */

// 1×1 gray PNG in the app's background-cache shape ({ url, dataUrl }) so the
// image layer paints without waiting on the external background host.
const SEED = {
  url: '',
  dataUrl:
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNoaGj4DwAFhAKAjM1mJgAAAABJRU5ErkJggg==',
};

async function seedBackground(page: Page) {
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

async function backgroundReady(page: Page) {
  await expect(page.locator('body')).toHaveAttribute('data-app-background', 'true', {
    timeout: 30_000,
  });
}

// Painted background alpha through the browser's own color pipeline, like
// the sibling theme-surface spec: quantized canvas readback, not CSS text.
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
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(2 / 255);
}

const SCRIM = '[data-slot="app-background-scrim"]';
const CARD = '[data-slot="card"]:has(aside)'; // pricing filter sidebar card

async function openThemeDrawer(page: Page) {
  await page.getByRole('button', { name: /Theme management|主题管理/ }).click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  return drawer;
}

function readout(drawer: Locator, label: RegExp) {
  return drawer.locator('div.rounded-lg.border').filter({ hasText: label }).locator('span').last();
}

test.describe('background surface presets', () => {
  test('fresh visitor gets the dark preset with no inline overrides', async ({ page }) => {
    await seedBackground(page);
    await page.goto('/pricing');
    await backgroundReady(page);

    const opacity = page.locator('html').evaluate((el) => el.style.getPropertyValue('--surface-opacity'));
    const scrim = page.locator('html').evaluate((el) => el.style.getPropertyValue('--app-background-scrim'));
    expect(opacity).toBe('');
    expect(scrim, 'no-cookie visit must not pin a surface value inline').toBe('');

    alphaNear(await alphaOf(page, CARD), 0.8);
    alphaNear(await alphaOf(page, SCRIM), 0.8);

    const drawer = await openThemeDrawer(page);
    await expect(readout(drawer, /Surface opacity|表面不透明度/)).toHaveText('80%');
    await expect(readout(drawer, /Blur radius|模糊半径/)).toHaveText('2px');
    await expect(readout(drawer, /Background scrim|背景暗底/)).toHaveText('80%');
  });

  test('light scheme reads its own preset, not the frozen dark one', async ({ page }) => {
    await seedBackground(page);
    await page.context().addCookies([
      { name: 'vite-ui-theme', value: 'light', url: process.env.BASE_URL ?? 'http://localhost:5173' },
    ]);
    await page.goto('/pricing');
    await backgroundReady(page);

    alphaNear(await alphaOf(page, CARD), 0.5);
    alphaNear(await alphaOf(page, SCRIM), 0.3);

    const drawer = await openThemeDrawer(page);
    await expect(readout(drawer, /Surface opacity|表面不透明度/)).toHaveText('50%');
    await expect(readout(drawer, /Blur radius|模糊半径/)).toHaveText('2px');
    await expect(readout(drawer, /Background scrim|背景暗底/)).toHaveText('30%');
  });

  test('header keeps text and icon shadows while the background is up', async ({ page }) => {
    await seedBackground(page);
    await page.goto('/pricing');
    await backgroundReady(page);

    // Wait past the header's entry transition so the settled shadow is
    // measured, not an interpolated transition frame.
    await page.waitForTimeout(1200);
    const linkShadow = await page
      .locator('[data-slot="public-header"] a')
      .first()
      .evaluate((el) => getComputedStyle(el).textShadow);
    expect(linkShadow).toMatch(/rgba?\([\d., ]+0\.[2-9][\d]*\) 0px 1px 2px/);

    const iconFilter = await page
      .locator('[data-slot="public-header"] svg')
      .first()
      .evaluate((el) => getComputedStyle(el).filter);
    expect(iconFilter).toContain('drop-shadow');
  });
});

test.describe('console surfaces over the background', () => {

  test('title band paints no extra layer; inset glass matches the card token', async ({
    adminPage: page,
  }) => {
    await seedBackground(page);
    // Seed lands before boot; the fixture login already booted once.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.goto('/dashboard/overview');
    await expect(page.getByRole('heading', { name: /概览|Overview/ }).first()).toBeVisible();
    await backgroundReady(page);

    // The page title row must stay transparent inside the inset panel: a
    // background here double-darkens the band (regression #1).
    alphaNear(await alphaOf(page, '[data-slot="sidebar-inset"] [data-slot="section-page-header"]'), 0);

    // Panel and cards share the --card-surface token; both read dark 80%.
    const inset = await alphaOf(page, '[data-slot="sidebar-inset"]');
    const card = await alphaOf(page, '[data-slot="card"]');
    alphaNear(inset, 0.8);
    expect(Math.abs(inset - card)).toBeLessThanOrEqual(2 / 255);

    // Header itself contributes no layer either.
    alphaNear(await alphaOf(page, '[data-slot="app-header"]'), 0);
  });
});
