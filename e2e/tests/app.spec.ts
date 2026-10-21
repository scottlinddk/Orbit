import { expect, test, type Page } from '@playwright/test'

const USERNAME = 'scott'
const PASSWORD = 'correct horse battery'

/**
 * One story, in order, against a fresh instance: first account, household, dashboard, widgets,
 * reload, mobile, sign out. Later steps depend on earlier ones, so the tests run serially.
 */
test.describe.configure({ mode: 'serial' })

let page: Page
const cspViolations: string[] = []
const consoleErrors: string[] = []
const unexpectedResponses: string[] = []

/** Failures this story causes on purpose. Anything else that fails is a bug. */
const EXPECTED_FAILURES = [
  /^401 GET .*\/api\/v1\/auth\/me$/, // asking who you are before signing in
  /^401 POST .*\/api\/v1\/auth\/login$/, // the deliberate wrong password
  /^404 GET .*\/api\/v1\/dashboards\/some-dashboard$/, // the deep link to a dashboard that does not exist
  /^403 POST .*\/api\/v1\/auth\/register$/, // the second account on a closed instance
]

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/content security policy/i.test(text)) cspViolations.push(text)
    // The browser logs every failed request here. Failed requests are judged by response below.
    else if (!/Failed to load resource/.test(text)) consoleErrors.push(text)
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() < 400) return
    const line = `${response.status()} ${response.request().method()} ${response.url()}`
    if (!EXPECTED_FAILURES.some((pattern) => pattern.test(line))) unexpectedResponses.push(line)
  })
})

test.afterAll(async () => {
  await page.close()
})

const titles = () => page.locator('article h2').allTextContents()

test('a deep link without a session lands on the sign-in page', async () => {
  await page.goto('/d/some-dashboard')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: 'Sign in to Orbit' })).toBeVisible()
})

test('a wrong password is explained without saying which part was wrong', async () => {
  await page.getByLabel('Username').fill('nobody')
  await page.getByLabel('Password').fill('not the password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid username or password')
})

// The code is printed in the server log on first start. The suite pins it so it can type it in.
const SETUP_CODE = process.env.ORBIT_E2E_SETUP_CODE ?? 'e2e-setup-code-1234'

test('the first account is refused without the right setup code', async () => {
  await page.getByRole('button', { name: 'Create the first account' }).click()
  await page.getByLabel('Setup code').fill('not-the-code-at-all')
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toContainText('setup code')
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible()
})

test('creating the first account with the setup code signs you in', async () => {
  await page.getByLabel('Setup code').fill(SETUP_CODE)
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Display name (optional)').fill('Scott')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  // Signing in returns you to the page you first asked for. That dashboard does not exist, and
  // the app says so in the words it uses for "missing or not yours".
  await expect(page).toHaveURL(/\/d\/some-dashboard$/)
  await expect(page.getByRole('alert')).toContainText('Not found, or you do not have access')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome to Orbit' })).toBeVisible()
})

test('the session cookie is invisible to scripts and strictly same-site', async () => {
  const cookie = (await page.context().cookies()).find((c) => c.name.endsWith('orbit_session'))
  expect(cookie, 'session cookie').toBeDefined()
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' })
  expect(await page.evaluate(() => document.cookie)).not.toContain('orbit_session')
})

test('a household and a dashboard can be created', async () => {
  await page.getByLabel('Household name').fill('Home')
  await page.getByRole('button', { name: 'Create household' }).click()
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()
  // A new household starts with a "Home" dashboard that shows today's date, not sample data.
  await page.getByRole('region', { name: 'Dashboards' }).getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('article', { name: 'Today' })).toBeVisible()
  await expect(page.getByText('Preview')).toHaveCount(0)
  await page.goBack()
  await page.getByLabel('New dashboard name').fill('Week')
  await page.getByRole('button', { name: 'Create dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Week', level: 1 })).toBeVisible()
  await expect(page.getByText('This dashboard is empty')).toBeVisible()
})

test('widgets can be added, reordered, resized and removed', async () => {
  await page.getByRole('button', { name: 'Edit layout' }).click()
  for (const name of ['Today', 'Agenda', 'Shopping list']) {
    await page.getByRole('button', { name: `Add ${name}` }).click()
    await expect(page.getByRole('article', { name })).toBeVisible()
  }
  await expect(page.getByText(/^Week \d+$/)).toBeVisible()

  await page.getByRole('button', { name: 'Options for Shopping list' }).click()
  await page.getByRole('button', { name: 'Move Shopping list earlier' }).click()
  await expect.poll(titles).toEqual(['Today', 'Shopping list', 'Agenda'])

  // A real drag with the mouse: Agenda is dropped on Today and takes its place.
  const handle = page.getByRole('button', { name: 'Drag Agenda to reorder' })
  const target = page.getByRole('article', { name: 'Today' })
  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
  await page.mouse.up()
  await expect.poll(titles).toEqual(['Agenda', 'Today', 'Shopping list'])

  // Width: drag the handle of Today one column to the right, then widen with the keyboard.
  const slider = page.getByRole('slider', { name: 'Width of Today' })
  await expect(slider).toHaveAttribute('aria-valuenow', '1')
  await slider.focus()
  await page.keyboard.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', '2')
  const grip = (await slider.boundingBox())!
  const gridBox = (await page.locator('ul[aria-label$="widgets"]').boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x - gridBox.width / 2, grip.y + grip.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(slider).toHaveAttribute('aria-valuenow', '1')

  // Put the order back for the steps below.
  await page.getByRole('button', { name: 'Options for Agenda' }).click()
  await page.getByRole('button', { name: 'Move Agenda later' }).click()
  await page.getByRole('button', { name: 'Move Agenda later' }).click()
  await expect.poll(titles).toEqual(['Today', 'Shopping list', 'Agenda'])

  await page.getByLabel('Columns').selectOption('2')
  await expect
    .poll(() =>
      page
        .locator('ul[aria-label$="widgets"]')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
    )
    .toBe(2)

  await page.getByRole('button', { name: 'Remove Agenda' }).click()
  await expect(page.getByRole('article', { name: 'Agenda' })).toHaveCount(0)
})

test('the household switcher shows where you are', async () => {
  await expect(page.locator('#household-switcher option:checked')).toHaveText('Home')
})

test('the dashboard survives a reload on its own address', async () => {
  await page.reload()
  await expect(page.getByRole('article', { name: 'Today' })).toBeVisible()
  await expect.poll(titles).toEqual(['Today', 'Shopping list'])
})

test('a narrow screen shows one column and never scrolls sideways', async () => {
  await page.setViewportSize({ width: 380, height: 800 })
  await expect
    .poll(() =>
      page
        .locator('ul[aria-label$="widgets"]')
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length),
    )
    .toBe(1)
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(sideways).toBe(false)
  await page.setViewportSize({ width: 1100, height: 800 })
})

test('an unknown address inside the app is a friendly page, not a blank one', async () => {
  await page.goto('/nowhere/at/all')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('a chosen theme and Google font load under the policy and survive a reload', async () => {
  await page.getByRole('link', { name: 'Appearance' }).click()
  await page.getByRole('button', { name: 'Forest' }).click()
  await page.getByLabel('Headings').selectOption('lora')
  // The font files are same-origin, so the policy allows them. Nothing may come from elsewhere.
  await expect
    .poll(() =>
      page.evaluate(() =>
        [...document.fonts].some((f) => f.family.includes('Lora') && f.status === 'loaded'),
      ),
    )
    .toBe(true)
  const heading = () =>
    page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-heading'),
    )
  expect(await heading()).toContain('Lora Variable')

  await page.reload()
  await expect(page.getByLabel('Theme name')).toHaveValue('My theme')
  expect(await heading()).toContain('Lora Variable')

  // ?reset-theme is the way back if a theme ever made the app unreadable.
  await page.goto('/appearance?reset-theme')
  await expect(page.getByRole('button', { name: 'Ember', pressed: true })).toBeVisible()
  await expect(page).toHaveURL(/\/appearance$/)
})

test('signing out ends the session', async () => {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('a second account cannot be created on a closed instance', async ({ browser }) => {
  const other = await browser.newPage()
  await other.goto('/login')
  await other.getByRole('button', { name: 'Create the first account' }).click()
  await other.getByLabel('Username').fill('intruder')
  await other.getByLabel('Password').fill(PASSWORD)
  await other.getByRole('button', { name: 'Create account' }).click()
  await expect(other.getByRole('alert')).toContainText('Registration is closed')
  await other.close()
})

test('signing back in restores the data', async () => {
  await page.getByLabel('Username').fill(USERNAME)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible()
  await page.getByRole('link', { name: 'Week' }).click()
  await expect.poll(titles).toEqual(['Today', 'Shopping list'])
})

test('the browser raised no policy violations, errors or unexpected failed requests', async () => {
  expect(cspViolations, 'Content Security Policy violations').toEqual([])
  expect(consoleErrors, 'console errors').toEqual([])
  expect(unexpectedResponses, 'unexpected failed requests').toEqual([])
})
