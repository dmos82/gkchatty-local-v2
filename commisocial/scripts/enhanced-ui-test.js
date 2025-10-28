#!/usr/bin/env node

/**
 * Enhanced UI Test with Network Request Monitoring
 *
 * This script solves the Playwright console capture limitation by:
 * 1. Monitoring ALL network requests and responses
 * 2. Capturing Supabase API errors (including RLS violations)
 * 3. Detecting silent failures (no redirect, no error message)
 * 4. Using Chrome DevTools Protocol for reliable console capture
 *
 * Usage:
 *   node scripts/enhanced-ui-test.js <test-name>
 *
 * Examples:
 *   node scripts/enhanced-ui-test.js signup-flow
 *   node scripts/enhanced-ui-test.js login-flow
 */

const { chromium } = require('playwright')
const fs = require('fs').promises
const path = require('path')

// Test configurations
const TESTS = {
  'signup-flow': {
    name: 'Signup Flow Test',
    url: 'http://localhost:3000/signup',
    screenshotDir: 'docs/screenshots/enhanced',
    actions: async (page) => {
      // Take initial screenshot
      await page.screenshot({ path: 'docs/screenshots/enhanced/01-signup-initial.png' })

      // Fill form (use realistic email domain for Supabase validation)
      const timestamp = Date.now()
      await page.fill('#username', 'testuser_' + timestamp)
      await page.fill('#email', `testuser${timestamp}@gmail.com`)
      await page.fill('#password', 'TestPass123!')

      // Screenshot filled form
      await page.screenshot({ path: 'docs/screenshots/enhanced/02-signup-filled.png' })

      // Get initial URL
      const initialUrl = page.url()

      // Wait for submit button to be present and enabled
      await page.waitForSelector('button:has-text("Sign up"):not([disabled])', { timeout: 5000 })

      // Click submit button with text "Sign up"
      await page.click('button:has-text("Sign up")')

      // Wait for either redirect or error message (max 10 seconds)
      await Promise.race([
        page.waitForURL(url => url !== initialUrl, { timeout: 10000 }),
        page.waitForSelector('.text-red-500', { timeout: 10000 }),
        page.waitForTimeout(10000)
      ]).catch(() => {})

      // Take final screenshot
      await page.screenshot({ path: 'docs/screenshots/enhanced/03-signup-result.png' })

      return {
        initialUrl,
        finalUrl: page.url(),
        redirected: page.url() !== initialUrl,
        expectedRedirect: '/feed'
      }
    }
  },

  'login-flow': {
    name: 'Login Flow Test',
    url: 'http://localhost:3000/login',
    screenshotDir: 'docs/screenshots/enhanced',
    actions: async (page) => {
      await page.screenshot({ path: 'docs/screenshots/enhanced/04-login-initial.png' })

      // Use a realistic email (needs to be an existing user)
      await page.fill('#email', 'testuser@gmail.com')
      await page.fill('#password', 'TestPass123!')

      await page.screenshot({ path: 'docs/screenshots/enhanced/05-login-filled.png' })

      const initialUrl = page.url()
      await page.click('button:has-text("Sign in")')

      await Promise.race([
        page.waitForURL(url => url !== initialUrl, { timeout: 10000 }),
        page.waitForSelector('.text-red-500', { timeout: 10000 }),
        page.waitForTimeout(10000)
      ]).catch(() => {})

      await page.screenshot({ path: 'docs/screenshots/enhanced/06-login-result.png' })

      return {
        initialUrl,
        finalUrl: page.url(),
        redirected: page.url() !== initialUrl,
        expectedRedirect: '/feed'
      }
    }
  }
}

async function runTest(testName) {
  const config = TESTS[testName]
  if (!config) {
    console.error(`❌ Unknown test: ${testName}`)
    console.log(`Available tests: ${Object.keys(TESTS).join(', ')}`)
    process.exit(1)
  }

  console.log(`\n🧪 Running: ${config.name}`)
  console.log(`📍 URL: ${config.url}\n`)

  // Ensure screenshot directory exists
  await fs.mkdir(config.screenshotDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  // Storage for captured data
  const networkRequests = []
  const networkResponses = []
  const consoleLogs = []
  const consoleErrors = []
  const cdpLogs = []

  // 1. NETWORK REQUEST MONITORING
  page.on('request', request => {
    const url = request.url()

    // Track all Supabase requests
    if (url.includes('supabase')) {
      networkRequests.push({
        timestamp: new Date().toISOString(),
        method: request.method(),
        url: url,
        headers: request.headers()
      })

      console.log(`📤 [REQUEST] ${request.method()} ${url}`)
    }
  })

  // 2. NETWORK RESPONSE MONITORING (CRITICAL FOR RLS ERRORS)
  page.on('response', async response => {
    const url = response.url()

    if (url.includes('supabase')) {
      let body = null
      let parsedBody = null

      try {
        body = await response.text()
        parsedBody = JSON.parse(body)
      } catch (e) {
        // Body might not be JSON
      }

      const responseData = {
        timestamp: new Date().toISOString(),
        status: response.status(),
        statusText: response.statusText(),
        url: url,
        body: parsedBody || body,
        headers: response.headers()
      }

      networkResponses.push(responseData)

      // Log response
      const statusEmoji = response.status() < 300 ? '✅' : response.status() < 500 ? '⚠️' : '❌'
      console.log(`${statusEmoji} [RESPONSE] ${response.status()} ${url}`)

      // Detect RLS errors
      if (body && body.includes('row-level security')) {
        console.error(`\n🔴 RLS POLICY VIOLATION DETECTED!`)
        console.error(`URL: ${url}`)
        console.error(`Response:`, parsedBody || body)
      }

      // Detect other Supabase errors
      if (parsedBody && parsedBody.message) {
        console.error(`\n⚠️ Supabase Error: ${parsedBody.message}`)
      }

      // Detect HTTP errors
      if (response.status() >= 400) {
        console.error(`\n❌ HTTP Error ${response.status()}: ${url}`)
        if (parsedBody) {
          console.error(`Details:`, parsedBody)
        }
      }
    }
  })

  // 3. STANDARD CONSOLE CAPTURE
  page.on('console', msg => {
    const text = msg.text()
    const type = msg.type()

    consoleLogs.push({
      timestamp: new Date().toISOString(),
      type: type,
      text: text
    })

    const emoji = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '💬'
    console.log(`${emoji} [CONSOLE ${type.toUpperCase()}] ${text}`)

    if (type === 'error') {
      consoleErrors.push(text)
    }
  })

  // 4. CHROME DEVTOOLS PROTOCOL (CDP) FOR ENHANCED CONSOLE CAPTURE
  const client = await context.newCDPSession(page)
  await client.send('Runtime.enable')

  client.on('Runtime.consoleAPICalled', event => {
    const args = event.args.map(arg => arg.value).join(' ')

    cdpLogs.push({
      timestamp: new Date().toISOString(),
      type: event.type,
      args: args
    })

    console.log(`🔍 [CDP ${event.type.toUpperCase()}] ${args}`)
  })

  // 5. RUN THE TEST
  try {
    await page.goto(config.url, { waitUntil: 'networkidle' })

    // Wait for React to hydrate (crucial for onClick handlers to work)
    await page.waitForTimeout(2000)

    // Execute test-specific actions
    const testResult = await config.actions(page)

    // 6. ANALYZE RESULTS
    const analysis = {
      testName: config.name,
      url: config.url,
      timestamp: new Date().toISOString(),

      // Test outcome
      testResult,

      // Network analysis
      totalRequests: networkRequests.length,
      totalResponses: networkResponses.length,
      errorResponses: networkResponses.filter(r => r.status >= 400),
      rlsErrors: networkResponses.filter(r =>
        r.body && JSON.stringify(r.body).includes('row-level security')
      ),

      // Console analysis
      totalConsoleLogs: consoleLogs.length,
      consoleErrors: consoleErrors,
      cdpLogs: cdpLogs.length,

      // Critical issues
      criticalIssues: []
    }

    // Detect critical issues
    if (analysis.rlsErrors.length > 0) {
      analysis.criticalIssues.push({
        severity: 'CRITICAL',
        type: 'RLS_POLICY_VIOLATION',
        message: 'Row-level security policy violation detected',
        details: analysis.rlsErrors
      })
    }

    if (analysis.errorResponses.length > 0) {
      analysis.criticalIssues.push({
        severity: 'HIGH',
        type: 'HTTP_ERROR',
        message: `${analysis.errorResponses.length} HTTP error(s) detected`,
        details: analysis.errorResponses
      })
    }

    if (!testResult.redirected && testResult.expectedRedirect) {
      analysis.criticalIssues.push({
        severity: 'HIGH',
        type: 'EXPECTED_REDIRECT_MISSING',
        message: `Expected redirect to ${testResult.expectedRedirect} did not occur`,
        details: {
          initialUrl: testResult.initialUrl,
          finalUrl: testResult.finalUrl,
          expected: testResult.expectedRedirect
        }
      })
    }

    if (consoleErrors.length > 0) {
      analysis.criticalIssues.push({
        severity: 'MEDIUM',
        type: 'CONSOLE_ERRORS',
        message: `${consoleErrors.length} console error(s) detected`,
        details: consoleErrors
      })
    }

    // 7. SAVE DETAILED REPORT
    const reportPath = path.join(config.screenshotDir, `${testName}-report.json`)
    await fs.writeFile(reportPath, JSON.stringify({
      analysis,
      networkRequests,
      networkResponses,
      consoleLogs,
      cdpLogs
    }, null, 2))

    console.log(`\n📊 Report saved: ${reportPath}`)

    // 8. PRINT SUMMARY
    console.log(`\n${'='.repeat(60)}`)
    console.log(`TEST SUMMARY: ${config.name}`)
    console.log(`${'='.repeat(60)}`)
    console.log(`Network Requests: ${analysis.totalRequests}`)
    console.log(`Network Responses: ${analysis.totalResponses}`)
    console.log(`Error Responses: ${analysis.errorResponses.length}`)
    console.log(`RLS Errors: ${analysis.rlsErrors.length}`)
    console.log(`Console Logs: ${analysis.totalConsoleLogs}`)
    console.log(`Console Errors: ${analysis.consoleErrors.length}`)
    console.log(`CDP Logs: ${analysis.cdpLogs}`)
    console.log(`\nCritical Issues: ${analysis.criticalIssues.length}`)

    if (analysis.criticalIssues.length > 0) {
      console.log(`\n🔴 CRITICAL ISSUES FOUND:\n`)
      analysis.criticalIssues.forEach((issue, i) => {
        console.log(`${i + 1}. [${issue.severity}] ${issue.type}`)
        console.log(`   ${issue.message}`)
        console.log(`   Details:`, JSON.stringify(issue.details, null, 2))
      })
    }

    console.log(`\n${'='.repeat(60)}`)

    // 9. EXIT CODE
    const exitCode = analysis.criticalIssues.length > 0 ? 1 : 0

    if (exitCode === 0) {
      console.log(`\n✅ TEST PASSED - No critical issues detected\n`)
    } else {
      console.log(`\n❌ TEST FAILED - ${analysis.criticalIssues.length} critical issue(s) found\n`)
    }

    await browser.close()
    process.exit(exitCode)

  } catch (error) {
    console.error(`\n❌ Test execution failed:`, error)

    // Save error report
    await fs.writeFile(
      path.join(config.screenshotDir, `${testName}-error.json`),
      JSON.stringify({ error: error.message, stack: error.stack }, null, 2)
    )

    await browser.close()
    process.exit(1)
  }
}

// Main
const testName = process.argv[2]

if (!testName) {
  console.log('Usage: node scripts/enhanced-ui-test.js <test-name>')
  console.log('\nAvailable tests:')
  Object.keys(TESTS).forEach(name => {
    console.log(`  - ${name}: ${TESTS[name].name}`)
  })
  process.exit(1)
}

runTest(testName)
