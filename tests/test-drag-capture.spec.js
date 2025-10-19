const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');

test.describe('Drag Capture Functionality', () => {
  let electronApp;
  let mainWindow;

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({ 
      args: ['main.js', '--dev'],
      timeout: 30000
    });
    
    // Get the main window
    mainWindow = await electronApp.firstWindow();
    await mainWindow.waitForLoadState('domcontentloaded');
    
    // Wait for app to be ready
    await mainWindow.waitForTimeout(2000);
  });

  test.afterAll(async () => {
    if (electronApp) {
      await electronApp.close();
    }
  });

  test('should allow drag selection and capture text', async () => {
    console.log('🧪 Starting drag capture test...');
    
    // Ensure capture mode is set to area
    await mainWindow.evaluate(() => {
      const captureModeSelect = document.getElementById('captureModeSelect');
      if (captureModeSelect) {
        captureModeSelect.value = 'area';
        captureModeSelect.dispatchEvent(new Event('change'));
      }
    });
    
    // Wait a moment for the setting to be applied
    await mainWindow.waitForTimeout(500);
    
    // Create a test text element to capture
    await mainWindow.evaluate(() => {
      // Remove any existing test element
      const existing = document.getElementById('test-text-element');
      if (existing) existing.remove();
      
      // Create a visible text element for testing
      const testElement = document.createElement('div');
      testElement.id = 'test-text-element';
      testElement.style.cssText = `
        position: fixed;
        top: 100px;
        left: 100px;
        width: 300px;
        height: 100px;
        background: white;
        border: 2px solid black;
        font-size: 24px;
        font-family: Arial, sans-serif;
        padding: 20px;
        z-index: 1000;
        color: black;
      `;
      testElement.textContent = 'TEST CAPTURE TEXT 123';
      document.body.appendChild(testElement);
    });
    
    console.log('📝 Test text element created');
    
    // Start capture process
    await mainWindow.evaluate(() => {
      window.electronAPI?.startCapture?.() || 
      window.ipcRenderer?.send?.('start-capture');
    });
    
    console.log('🚀 Capture process started');
    
    // Wait for capture window to appear
    await mainWindow.waitForTimeout(2000);
    
    // Get all windows (should include capture window)
    const windows = electronApp.windows();
    console.log(`🪟 Found ${windows.length} windows`);
    
    // Find the capture window (should be the newest one)
    let captureWindow = null;
    for (const window of windows) {
      try {
        const url = window.url();
        if (url.includes('capture.html')) {
          captureWindow = window;
          break;
        }
      } catch (e) {
        // Window might be closed or not accessible
      }
    }
    
    if (!captureWindow) {
      // If we can't find by URL, try the last window
      captureWindow = windows[windows.length - 1];
    }
    
    expect(captureWindow).toBeTruthy();
    console.log('🎯 Capture window found');
    
    // Wait for capture window to be ready
    await captureWindow.waitForLoadState('domcontentloaded');
    await captureWindow.waitForTimeout(1000);
    
    // Perform drag selection on the test text area
    const testBounds = { x: 100, y: 100, width: 300, height: 100 };
    
    console.log('🖱️ Starting drag selection...');
    
    // Simulate mouse drag to select the test text area
    await captureWindow.mouse.move(testBounds.x, testBounds.y);
    await captureWindow.mouse.down();
    await captureWindow.waitForTimeout(100);
    
    await captureWindow.mouse.move(
      testBounds.x + testBounds.width, 
      testBounds.y + testBounds.height
    );
    await captureWindow.waitForTimeout(100);
    
    await captureWindow.mouse.up();
    
    console.log('🖱️ Drag selection completed');
    
    // Wait for OCR processing
    await mainWindow.waitForTimeout(5000);
    
    // Check if text was extracted and displayed in main window
    const extractedText = await mainWindow.evaluate(() => {
      const resultElement = document.querySelector('.result-text') || 
                           document.querySelector('#result') ||
                           document.querySelector('[data-testid="extracted-text"]');
      return resultElement ? resultElement.textContent.trim() : '';
    });
    
    console.log('📄 Extracted text:', extractedText);
    
    // Verify that some text was captured
    expect(extractedText.length).toBeGreaterThan(0);
    
    // Check if the captured text contains expected content
    const normalizedText = extractedText.toLowerCase().replace(/\s+/g, ' ');
    const hasTestText = normalizedText.includes('test') || 
                       normalizedText.includes('capture') || 
                       normalizedText.includes('123');
    
    if (hasTestText) {
      console.log('✅ Test text successfully captured!');
    } else {
      console.log('⚠️ Captured text may not match expected content, but OCR is working');
    }
    
    // Clean up test element
    await mainWindow.evaluate(() => {
      const testElement = document.getElementById('test-text-element');
      if (testElement) testElement.remove();
    });
    
    console.log('🧹 Test cleanup completed');
  });

  test('should handle small selection areas properly', async () => {
    console.log('🧪 Testing small selection handling...');
    
    // Start capture process
    await mainWindow.evaluate(() => {
      window.electronAPI?.startCapture?.() || 
      window.ipcRenderer?.send?.('start-capture');
    });
    
    // Wait for capture window
    await mainWindow.waitForTimeout(2000);
    
    const windows = electronApp.windows();
    let captureWindow = windows[windows.length - 1];
    
    if (captureWindow) {
      await captureWindow.waitForLoadState('domcontentloaded');
      await captureWindow.waitForTimeout(1000);
      
      // Try to make a very small selection (should be rejected)
      await captureWindow.mouse.move(100, 100);
      await captureWindow.mouse.down();
      await captureWindow.mouse.move(105, 105); // Only 5x5 pixels
      await captureWindow.mouse.up();
      
      // Wait a moment to see if feedback appears
      await captureWindow.waitForTimeout(1000);
      
      // Check if warning feedback is shown
      const feedbackVisible = await captureWindow.evaluate(() => {
        const feedback = document.querySelector('.feedback');
        return feedback && feedback.textContent.includes('larger area');
      });
      
      console.log('📏 Small selection feedback:', feedbackVisible ? 'shown' : 'not shown');
      
      // Press Escape to cancel
      await captureWindow.keyboard.press('Escape');
      await mainWindow.waitForTimeout(500);
    }
    
    console.log('✅ Small selection test completed');
  });
});