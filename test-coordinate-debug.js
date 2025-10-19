const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');

// Simple test to trigger coordinate transformation debug
async function testCoordinateTransformation() {
  console.log('🧪 Testing coordinate transformation...');
  
  // Simulate display info
  const displayInfo = {
    scaleFactor: 2.0,
    menuBarHeight: 25,
    workArea: { x: 0, y: 25, width: 1920, height: 1055 }
  };
  
  // Simulate raw bounds from drag selection
  const rawBounds = {
    x: 100,
    y: 100,
    width: 200,
    height: 150
  };
  
  console.log('📊 Test input:');
  console.log('  Display info:', displayInfo);
  console.log('  Raw bounds:', rawBounds);
  
  // Test transformation logic
  const overlayBounds = true; // Simulate overlay mode
  
  let actualBounds;
  
  if (overlayBounds) {
    actualBounds = {
      x: rawBounds.x,
      y: rawBounds.y - displayInfo.menuBarHeight,
      width: rawBounds.width,
      height: rawBounds.height,
    };
    console.log('🔍 Using overlay coordinates, adjusted for menu bar');
  } else {
    actualBounds = {
      x: rawBounds.x + displayInfo.workArea.x,
      y: rawBounds.y + displayInfo.workArea.y,
      width: rawBounds.width,
      height: rawBounds.height,
    };
    console.log('🔍 Using main window coordinates, adjusted for work area');
  }
  
  console.log('📍 Actual bounds after adjustment:', actualBounds);
  
  // Scale for high DPI displays
  const scaledBounds = {
    x: Math.round(actualBounds.x * displayInfo.scaleFactor),
    y: Math.round(actualBounds.y * displayInfo.scaleFactor),
    width: Math.round(actualBounds.width * displayInfo.scaleFactor),
    height: Math.round(actualBounds.height * displayInfo.scaleFactor),
  };
  
  console.log('📏 Scaled bounds for capture:', scaledBounds);
  
  // Test thumbnail scaling
  const thumbnailSize = { width: 3840, height: 2160 };
  const screenBounds = { width: 1920, height: 1080 };
  
  const thumbnailScaleX = thumbnailSize.width / screenBounds.width;
  const thumbnailScaleY = thumbnailSize.height / screenBounds.height;
  
  console.log('🖼️ Thumbnail scale factors:', { x: thumbnailScaleX, y: thumbnailScaleY });
  
  const thumbnailBounds = {
    x: Math.round(scaledBounds.x * thumbnailScaleX),
    y: Math.round(scaledBounds.y * thumbnailScaleY),
    width: Math.round(scaledBounds.width * thumbnailScaleX),
    height: Math.round(scaledBounds.height * thumbnailScaleY)
  };
  
  console.log('🎯 Final thumbnail bounds for cropping:', thumbnailBounds);
}

testCoordinateTransformation();