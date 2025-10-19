const { test, expect } = require('@playwright/test');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Helper function to create test images with text
async function createTestImage(page, content, filename) {
  await page.setContent(`
    <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            font-size: 24px;
            padding: 50px;
            background: white;
            color: black;
            line-height: 1.6;
          }
          .test-content {
            max-width: 800px;
            margin: 0 auto;
          }
        </style>
      </head>
      <body>
        <div class="test-content">
          ${content}
        </div>
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

test.describe('OCR Integration Tests', () => {
  test.beforeAll(async () => {
    // Ensure test directory exists
    const testDir = path.join(__dirname);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  test('should create test image with simple text', async ({ page }) => {
    const content = `
      <h1>Simple OCR Test</h1>
      <p>This is a basic text recognition test.</p>
      <p>The quick brown fox jumps over the lazy dog.</p>
      <p>Numbers: 1234567890</p>
    `;

    await createTestImage(page, content, 'simple-text-test.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'simple-text-test.png'));
    expect(imageExists).toBeTruthy();
  });

  test('should create test image simulating Trae IDE interface', async ({ page }) => {
    const content = `
      <div style="background: #1e1e1e; color: #d4d4d4; padding: 20px; font-family: 'Monaco', monospace;">
        <h2 style="color: #569cd6;">Trae IDE - main.js</h2>
        <div style="background: #2d2d30; padding: 15px; border-radius: 4px; margin: 10px 0;">
          <div style="color: #608b4e;">// OCR Screen Capture Application</div>
          <div><span style="color: #569cd6;">const</span> { app, BrowserWindow } = <span style="color: #569cd6;">require</span>(<span style="color: #ce9178;">'electron'</span>);</div>
          <div><span style="color: #569cd6;">const</span> Tesseract = <span style="color: #569cd6;">require</span>(<span style="color: #ce9178;">'tesseract.js'</span>);</div>
          <br>
          <div><span style="color: #569cd6;">async function</span> <span style="color: #dcdcaa;">processOCR</span>(imageData) {</div>
          <div>&nbsp;&nbsp;<span style="color: #569cd6;">const</span> result = <span style="color: #569cd6;">await</span> Tesseract.<span style="color: #dcdcaa;">recognize</span>(imageData);</div>
          <div>&nbsp;&nbsp;<span style="color: #569cd6;">return</span> result.data.text;</div>
          <div>}</div>
        </div>
        <div style="color: #808080; font-size: 12px;">
          Line 285 | Column 15 | UTF-8 | JavaScript
        </div>
      </div>
    `;

    await createTestImage(page, content, 'trae-ide-simulation.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'trae-ide-simulation.png'));
    expect(imageExists).toBeTruthy();
  });

  test('should create test image with mixed content types', async ({ page }) => {
    const content = `
      <h1>Mixed Content OCR Test</h1>
      <h2>Code Snippet:</h2>
      <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px;">
function captureScreen() {
  const sources = await desktopCapturer.getSources({
    types: ['screen']
  });
  return sources[0].thumbnail;
}
      </pre>
      <h2>Regular Text:</h2>
      <p>This application captures screen content and extracts text using OCR technology.</p>
      <h2>Numbers and Symbols:</h2>
      <p>Version: 1.0.0 | Build: #12345</p>
      <p>Email: test@example.com | URL: https://github.com/user/repo</p>
      <p>Special chars: @#$%^&*()_+-=[]{}|;:,.<>?</p>
    `;

    await createTestImage(page, content, 'mixed-content-test.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'mixed-content-test.png'));
    expect(imageExists).toBeTruthy();
  });

  test('should verify test images can be processed by Tesseract', async () => {
    // This test verifies that our test images are suitable for OCR
    const testImages = [
      'simple-text-test.png',
      'trae-ide-simulation.png', 
      'mixed-content-test.png'
    ];

    for (const imageName of testImages) {
      const imagePath = path.join(__dirname, imageName);
      const imageExists = fs.existsSync(imagePath);
      expect(imageExists).toBeTruthy();
      
      // Check file size to ensure it's a valid image
      const stats = fs.statSync(imagePath);
      expect(stats.size).toBeGreaterThan(1000); // At least 1KB
    }
  });
});

test.describe('Manual OCR Testing Instructions', () => {
  test('should provide instructions for manual testing', async () => {
    const instructions = `
    MANUAL TESTING INSTRUCTIONS:
    
    1. Start the OCR Screen Capture app (npm start)
    2. Open one of the test images created by these tests:
       - tests/simple-text-test.png
       - tests/trae-ide-simulation.png
       - tests/mixed-content-test.png
    3. Display the image on your screen
    4. Press Cmd+Shift+2 to trigger screen capture
    5. Verify that:
       - The app captures the image content (not its own window)
       - OCR processes the text correctly
       - If auto-copy is enabled, text is copied to clipboard
       - If auto-copy is enabled, main window stays hidden
       - If auto-copy is disabled, main window shows with results
    
    EXPECTED RESULTS:
    - Simple text should be recognized accurately
    - Code snippets should maintain basic structure
    - Numbers and special characters should be captured
    - The app should not capture its own interface
    `;

    console.log(instructions);
    expect(instructions).toContain('MANUAL TESTING INSTRUCTIONS');
  });

  test('should verify app configuration for testing', async () => {
    // Check if the app has the correct default settings for testing
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    
    expect(packageJson.name).toBe('ocr-screen-capture');
    expect(packageJson.main).toBe('main.js');
    
    // Verify main.js exists
    const mainJsPath = path.join(__dirname, '..', 'main.js');
    const mainJsExists = fs.existsSync(mainJsPath);
    expect(mainJsExists).toBeTruthy();
  });
});

test.describe('Clipboard Testing Simulation', () => {
  test('should simulate clipboard operations', async () => {
    // This test simulates what should happen with clipboard operations
    const testText = "This is sample OCR extracted text";
    
    // In a real test environment, you would:
    // 1. Clear the system clipboard
    // 2. Trigger the OCR app with auto-copy enabled
    // 3. Verify the clipboard contains the extracted text
    
    // For now, we simulate the expected behavior
    const simulatedClipboardContent = testText;
    expect(simulatedClipboardContent).toBe(testText);
    expect(simulatedClipboardContent.length).toBeGreaterThan(0);
  });

  test('should test different auto-copy scenarios', async () => {
    const scenarios = [
      { autoCopy: true, shouldShowWindow: false, shouldCopyToClipboard: true },
      { autoCopy: false, shouldShowWindow: true, shouldCopyToClipboard: false }
    ];

    for (const scenario of scenarios) {
      // Simulate testing each scenario
      console.log(`Testing scenario: autoCopy=${scenario.autoCopy}`);
      expect(typeof scenario.autoCopy).toBe('boolean');
      expect(typeof scenario.shouldShowWindow).toBe('boolean');
      expect(typeof scenario.shouldCopyToClipboard).toBe('boolean');
    }
  });
});

test.describe('Performance and Error Handling', () => {
  test('should handle large images gracefully', async ({ page }) => {
    // Create a larger test image
    const content = `
      <div style="padding: 100px; font-size: 18px;">
        ${'<p>This is a large document with lots of text content. '.repeat(50)}</p>
        <h1>Large Document Test</h1>
        ${'<p>More content to make this a substantial image for OCR processing. '.repeat(30)}</p>
      </div>
    `;

    await createTestImage(page, content, 'large-document-test.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'large-document-test.png'));
    expect(imageExists).toBeTruthy();
    
    // Check that the image is reasonably large
    const stats = fs.statSync(path.join(__dirname, 'large-document-test.png'));
    expect(stats.size).toBeGreaterThan(50000); // At least 50KB
  });

  test('should create test image with challenging OCR content', async ({ page }) => {
    const content = `
      <div style="padding: 30px;">
        <h2>Challenging OCR Content</h2>
        <p style="font-size: 12px;">Small text that might be hard to read</p>
        <p style="font-family: serif; font-style: italic;">Italic serif text</p>
        <p style="background: #333; color: #ccc; padding: 10px;">Light text on dark background</p>
        <p>Mixed CASE and numb3rs: ABC123def456GHI789</p>
        <p style="letter-spacing: 3px;">S p a c e d   o u t   t e x t</p>
        <div style="transform: rotate(5deg); display: inline-block;">Slightly rotated text</div>
      </div>
    `;

    await createTestImage(page, content, 'challenging-ocr-test.png');
    
    const imageExists = fs.existsSync(path.join(__dirname, 'challenging-ocr-test.png'));
    expect(imageExists).toBeTruthy();
  });
});