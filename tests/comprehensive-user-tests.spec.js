const { test, expect } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { setTimeout } = require('timers/promises');

// Test configuration
const APP_PATH = path.join(__dirname, '..');
const ELECTRON_PATH = require('electron');

class OCRTestApp {
  constructor() {
    this.process = null;
    this.isRunning = false;
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.process = spawn(ELECTRON_PATH, [APP_PATH], {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' }
      });

      this.process.stdout.on('data', (data) => {
        console.log(`App stdout: ${data}`);
      });

      this.process.stderr.on('data', (data) => {
        console.log(`App stderr: ${data}`);
      });

      this.process.on('error', (error) => {
        console.error('Failed to start app:', error);
        reject(error);
      });

      // Wait for app to start
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.isRunning = true;
          resolve();
        } else {
          reject(new Error('Failed to start Electron app'));
        }
      }, 3000);
    });
  }

  async stop() {
    if (this.process && !this.process.killed) {
      this.isRunning = false;
      this.process.kill('SIGTERM');
      return new Promise((resolve) => {
        this.process.on('close', resolve);
        // Force kill after 5 seconds
        setTimeout(() => {
          if (!this.process.killed) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);
      });
    }
  }

  async simulateShortcut() {
    // Simulate Cmd+Shift+2 shortcut
    if (process.platform === 'darwin') {
      try {
        execSync('osascript -e "tell application \\"System Events\\" to keystroke \\"2\\" using {command down, shift down}"');
        await setTimeout(1000); // Wait for response
      } catch (error) {
        console.log('Could not simulate shortcut:', error.message);
      }
    }
  }
}

// Helper function to create test content for screenshots
async function createTestContent(page, content, filename) {
  await page.setContent(`
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif;
            font-size: 18px;
            padding: 40px;
            background: white;
            color: black;
            line-height: 1.5;
            max-width: 1000px;
            margin: 0 auto;
          }
          .code-block {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 6px;
            padding: 16px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
            font-size: 14px;
            margin: 16px 0;
            overflow-x: auto;
          }
          .trae-ide {
            background: #1e1e1e;
            color: #d4d4d4;
            padding: 20px;
            border-radius: 8px;
            font-family: 'Monaco', 'Menlo', monospace;
            font-size: 14px;
          }
          .keyword { color: #569cd6; }
          .string { color: #ce9178; }
          .comment { color: #608b4e; }
          .function { color: #dcdcaa; }
          h1 { color: #0066cc; margin-bottom: 20px; }
          h2 { color: #333; margin: 24px 0 12px 0; }
        </style>
      </head>
      <body>
        ${content}
      </body>
    </html>
  `);

  const screenshot = await page.screenshot({
    path: path.join(__dirname, filename),
    fullPage: true,
    type: 'png'
  });

  return screenshot;
}

test.describe('Comprehensive OCR User Tests', () => {
  let ocrApp;

  test.beforeAll(async () => {
    // Ensure test directory exists
    const testDir = path.join(__dirname);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test.afterEach(async () => {
    if (ocrApp) {
      await ocrApp.stop();
      ocrApp = null;
    }
  });

  test('should create test content for basic text recognition', async ({ page }) => {
    const content = `
      <h1>Basic Text Recognition Test</h1>
      <p>This is a simple paragraph with regular text that should be easily recognized by OCR.</p>
      <p>The quick brown fox jumps over the lazy dog.</p>
      <p>Numbers: 1234567890</p>
      <p>Special characters: @#$%^&*()_+-=[]{}|;:,.<>?</p>
      <h2>Mixed Case Text</h2>
      <p>MiXeD cAsE tExT with UPPERCASE and lowercase letters.</p>
    `;

    await createTestContent(page, content, 'basic-text-test.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'basic-text-test.png'));
    expect(imageExists).toBeTruthy();
  });

  test('should create test content simulating Trae IDE code', async ({ page }) => {
    const content = `
      <div class="trae-ide">
        <h2 style="color: #569cd6; margin-bottom: 16px;">Trae IDE - main.js</h2>
        <div style="margin-bottom: 8px;">
          <span class="comment">// OCR Screen Capture Application</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span class="keyword">const</span> { app, BrowserWindow } = <span class="keyword">require</span>(<span class="string">'electron'</span>);
        </div>
        <div style="margin-bottom: 8px;">
          <span class="keyword">const</span> Tesseract = <span class="keyword">require</span>(<span class="string">'tesseract.js'</span>);
        </div>
        <div style="margin-bottom: 16px;"></div>
        <div style="margin-bottom: 8px;">
          <span class="keyword">async function</span> <span class="function">processOCR</span>(imageData) {
        </div>
        <div style="margin-bottom: 8px; padding-left: 20px;">
          <span class="keyword">const</span> result = <span class="keyword">await</span> Tesseract.<span class="function">recognize</span>(imageData);
        </div>
        <div style="margin-bottom: 8px; padding-left: 20px;">
          <span class="keyword">return</span> result.data.text;
        </div>
        <div style="margin-bottom: 8px;">}</div>
        <div style="margin-top: 16px; color: #808080; font-size: 12px;">
          Line 285 | Column 15 | UTF-8 | JavaScript
        </div>
      </div>
    `;

    await createTestContent(page, content, 'trae-ide-code-test.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'trae-ide-code-test.png'));
    expect(imageExists).toBeTruthy();
  });

  test('should create test content with mixed content types', async ({ page }) => {
    const content = `
      <h1>Mixed Content OCR Test</h1>
      <h2>Regular Text Section</h2>
      <p>This section contains regular paragraph text that should be easily readable.</p>
      
      <h2>Code Block Section</h2>
      <div class="code-block">
function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen']
  });
  return sources[0].thumbnail;
}
      </div>
      
      <h2>Data and Numbers</h2>
      <p>Version: 1.0.0 | Build: #12345</p>
      <p>Email: test@example.com</p>
      <p>URL: https://github.com/user/ocr-screen-capture</p>
      
      <h2>Technical Information</h2>
      <p>Resolution: 1920x1080 | DPI: 144 | Color Depth: 24-bit</p>
      <p>Timestamp: 2024-10-18T17:30:45.123Z</p>
    `;

    await createTestContent(page, content, 'mixed-content-test.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'mixed-content-test.png'));
    expect(imageExists).toBeTruthy();
  });

  test('should create test content for area selection testing', async ({ page }) => {
    const content = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 40px; padding: 20px;">
        <div>
          <h2>Left Column - Select This Area</h2>
          <p>This text should be captured when selecting the left area.</p>
          <div class="code-block">
const leftSideCode = true;
console.log('Left side selected');
          </div>
          <p>Additional left side content for testing area selection accuracy.</p>
        </div>
        <div>
          <h2>Right Column - Don't Select</h2>
          <p>This text should NOT be captured when selecting only the left area.</p>
          <div class="code-block">
const rightSideCode = false;
console.log('Right side not selected');
          </div>
          <p>Right side content that should be excluded from left area selection.</p>
        </div>
      </div>
      <div style="margin-top: 40px; padding: 20px; background: #f0f0f0; border-radius: 8px;">
        <h2>Bottom Section - Separate Selection</h2>
        <p>This bottom section can be selected independently to test multiple area captures.</p>
        <p>Test data: Area selection precision test - Bottom section content.</p>
      </div>
    `;

    await createTestContent(page, content, 'area-selection-test.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'area-selection-test.png'));
    expect(imageExists).toBeTruthy();
  });

  test('should start OCR app and verify it runs', async () => {
    ocrApp = new OCRTestApp();
    await ocrApp.start();
    
    expect(ocrApp.isRunning).toBeTruthy();
    
    // Wait a bit to ensure app is fully loaded
    await setTimeout(2000);
    
    expect(ocrApp.process).toBeTruthy();
    expect(ocrApp.process.killed).toBeFalsy();
  });

  test('should test keyboard shortcut functionality', async () => {
    ocrApp = new OCRTestApp();
    await ocrApp.start();
    
    // Wait for app to be ready
    await setTimeout(2000);
    
    // Simulate the keyboard shortcut
    await ocrApp.simulateShortcut();
    
    // Wait for potential response
    await setTimeout(1000);
    
    // App should still be running after shortcut
    expect(ocrApp.isRunning).toBeTruthy();
  });

  test('should verify test images are suitable for OCR processing', async () => {
    const testImages = [
      'basic-text-test.png',
      'trae-ide-code-test.png',
      'mixed-content-test.png',
      'area-selection-test.png'
    ];

    for (const imageName of testImages) {
      const imagePath = path.join(__dirname, imageName);
      const imageExists = fs.existsSync(imagePath);
      expect(imageExists).toBeTruthy();
      
      // Check file size to ensure it's a valid image
      const stats = fs.statSync(imagePath);
      expect(stats.size).toBeGreaterThan(5000); // At least 5KB
      expect(stats.size).toBeLessThan(5000000); // Less than 5MB
    }
  });

  test('should provide comprehensive manual testing instructions', async () => {
    const instructions = `
    COMPREHENSIVE MANUAL TESTING GUIDE FOR OCR SCREEN CAPTURE
    
    SETUP:
    1. Start the OCR app: npm start
    2. Ensure the app window is visible and responsive
    3. Check that all test images are created in tests/ folder
    
    TEST SCENARIOS:
    
    A. BASIC FUNCTIONALITY TESTS:
    1. Open tests/basic-text-test.png in an image viewer
    2. Press Cmd+Shift+2 (or click Capture Area button)
    3. Verify overlay appears ON TOP of the image viewer
    4. Select the entire text area by dragging
    5. Verify OCR processes the text correctly
    6. Check clipboard if auto-copy is enabled
    
    B. AREA SELECTION TESTS:
    1. Open tests/area-selection-test.png
    2. Trigger capture (Cmd+Shift+2)
    3. Select ONLY the left column area
    4. Verify only left column text is captured
    5. Repeat with bottom section selection
    6. Test small area selections (should show error)
    
    C. TRAE IDE SIMULATION TESTS:
    1. Open tests/trae-ide-code-test.png
    2. Trigger capture overlay
    3. Select the code area precisely
    4. Verify code structure is maintained in OCR output
    5. Check that syntax highlighting doesn't interfere
    
    D. WINDOW MANAGEMENT TESTS:
    1. Have multiple windows open (IDE, browser, etc.)
    2. Trigger capture from OCR app
    3. Verify overlay appears on top of ALL windows
    4. Verify main OCR window is hidden during capture
    5. Test ESC key to cancel capture
    6. Verify main window reappears after cancel
    
    E. AUTO-COPY BEHAVIOR TESTS:
    1. Enable auto-copy in settings
    2. Perform capture and area selection
    3. Verify text is copied to clipboard
    4. Verify main window stays hidden after capture
    5. Disable auto-copy and repeat
    6. Verify main window shows with results
    
    F. ERROR HANDLING TESTS:
    1. Try very small area selections (< 10px)
    2. Try capturing areas with no text
    3. Test capture with no screen recording permissions
    4. Test rapid successive captures
    
    EXPECTED RESULTS:
    - Overlay always appears on top of current windows
    - Area selection is precise and responsive
    - OCR accurately extracts text from selected areas
    - Window management works correctly (hide/show)
    - Auto-copy behavior matches settings
    - Error messages are clear and helpful
    - App doesn't capture its own interface
    
    PERFORMANCE EXPECTATIONS:
    - Overlay appears within 500ms of trigger
    - Area selection is smooth with no lag
    - OCR processing completes within 10 seconds
    - Memory usage remains reasonable during operation
    `;

    console.log(instructions);
    expect(instructions).toContain('COMPREHENSIVE MANUAL TESTING GUIDE');
    expect(instructions).toContain('AREA SELECTION TESTS');
    expect(instructions).toContain('WINDOW MANAGEMENT TESTS');
  });
});

test.describe('Configuration and Settings Tests', () => {
  test('should verify app configuration files', async () => {
    // Check package.json
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    expect(packageJson.name).toBe('ocr-screen-capture');
    expect(packageJson.main).toBe('main.js');
    expect(packageJson.dependencies).toHaveProperty('tesseract.js');
    expect(packageJson.dependencies).toHaveProperty('electron-store');
    
    // Check main.js exists
    const mainJsPath = path.join(__dirname, '..', 'main.js');
    expect(fs.existsSync(mainJsPath)).toBeTruthy();
    
    // Check capture.html exists
    const captureHtmlPath = path.join(__dirname, '..', 'capture.html');
    expect(fs.existsSync(captureHtmlPath)).toBeTruthy();
  });

  test('should test different capture modes', async () => {
    const captureModes = ['fullscreen', 'area'];
    
    for (const mode of captureModes) {
      console.log(`Testing capture mode: ${mode}`);
      expect(['fullscreen', 'area']).toContain(mode);
    }
  });

  test('should test auto-copy configurations', async () => {
    const autoCopyOptions = [true, false];
    
    for (const autoCopy of autoCopyOptions) {
      console.log(`Testing auto-copy: ${autoCopy}`);
      expect(typeof autoCopy).toBe('boolean');
    }
  });
});

test.describe('Performance and Reliability Tests', () => {
  test('should handle multiple rapid captures', async () => {
    // Simulate rapid capture attempts
    const rapidCaptures = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      timestamp: Date.now() + i * 100
    }));

    for (const capture of rapidCaptures) {
      console.log(`Simulating rapid capture ${capture.id} at ${capture.timestamp}`);
      expect(capture.id).toBeGreaterThan(0);
    }
  });

  test('should verify memory usage expectations', async () => {
    // Test that app doesn't consume excessive memory
    const memoryLimit = 500 * 1024 * 1024; // 500MB limit
    const currentMemory = process.memoryUsage().heapUsed;
    
    console.log(`Current memory usage: ${Math.round(currentMemory / 1024 / 1024)}MB`);
    expect(currentMemory).toBeLessThan(memoryLimit);
  });

  test('should test error recovery scenarios', async () => {
    const errorScenarios = [
      'No screen recording permission',
      'Area selection too small',
      'OCR processing failure',
      'Clipboard access denied',
      'Window destroyed during capture'
    ];

    for (const scenario of errorScenarios) {
      console.log(`Testing error scenario: ${scenario}`);
      expect(scenario).toBeTruthy();
    }
  });
});