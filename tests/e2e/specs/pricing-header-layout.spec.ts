import { test, expect } from '../fixtures/auth'

test.describe('pricing header layout', () => {
  test('centers the title and search on separate rows at desktop and phone widths', async ({ page }) => {
    for (const width of [1492, 390]) {
      await page.setViewportSize({ width, height: 931 })
      await page.goto('/pricing')

      const title = page.getByRole('heading', { name: /Model Square|模型广场/ })
      const search = page.getByRole('textbox', { name: /Search models|搜索模型/ })
      await expect(title).toBeVisible()
      await expect(search).toBeVisible()

      const titlePanel = await title.locator('xpath=..').boundingBox()
      const searchBox = await search.boundingBox()
      expect(titlePanel).not.toBeNull()
      expect(searchBox).not.toBeNull()
      expect(await title.evaluate((element) => getComputedStyle(element).textAlign)).toBe('center')
      expect(await title.locator('xpath=..').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgba(0, 0, 0, 0)')
      expect(searchBox!.y).toBeGreaterThan(titlePanel!.y + titlePanel!.height)
      expect(Math.abs(titlePanel!.x + titlePanel!.width / 2 - width / 2)).toBeLessThan(24)
      expect(Math.abs(searchBox!.x + searchBox!.width / 2 - width / 2)).toBeLessThan(24)
      expect(searchBox!.x).toBeGreaterThan(0)
      expect(searchBox!.x + searchBox!.width).toBeLessThan(width)
      if (width > 1024) expect(searchBox!.width).toBeLessThanOrEqual(720)
    }
  })
})
