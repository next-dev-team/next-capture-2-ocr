// Debug script to test coordinate transformation and image capture
const { screen, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');

async function testCapture() {
  console.log('🔍 Testing coordinate transformation and capture...');
  
  // Simulate the bounds from the recent capture attempt
  const overlayBounds = { x: 591, y: 213, width: 231, height: 304 };
  console.log('📍 Original overlay bounds:', overlayBounds);
  
  // Get display info (simulating the app's logic)
  const primaryDisplay = screen.getPrimaryDisplay();
  const displayInfo = {
    bounds: primaryDisplay.bounds,
    workArea: primaryDisplay.workArea,
    scaleFactor: primaryDisplay.scaleFactor
  };
  
  console.log('🖥️ Display info:', displayInfo);
  
  // Transform bounds (current app logic)
  const actualBounds = {
    x: overlayBounds.x,
    y: overlayBounds.y,
    width: overlayBounds.width,
    height: overlayBounds.height
  };
  
  console.log('📐 Actual bounds (no menu bar adjustment):', actualBounds);
  
  // Scale bounds for capture
  const scaledBounds = {
    x: Math.round(actualBounds.x * displayInfo.scaleFactor),
    y: Math.round(actualBounds.y * displayInfo.scaleFactor),
    width: Math.round(actualBounds.width * displayInfo.scaleFactor),
    height: Math.round(actualBounds.height * displayInfo.scaleFactor)
  };
  
  console.log('📏 Scaled bounds for capture:', scaledBounds);
  
  // Get desktop sources
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize: { width: 3840, height: 2160 },
  });
  
  if (sources.length === 0) {
    console.error('❌ No screen sources available');
    return;
  }
  
  const primarySource = sources[0];
  const thumbnail = primarySource.thumbnail;
  const thumbnailSize = thumbnail.getSize();
  
  console.log('🖼️ Thumbnail dimensions:', thumbnailSize);
  console.log('🖥️ Screen dimensions:', displayInfo.bounds);
  
  // Calculate thumbnail scaling
  const thumbnailScaleX = thumbnailSize.width / displayInfo.bounds.width;
  const thumbnailScaleY = thumbnailSize.height / displayInfo.bounds.height;
  
  console.log('📏 Thumbnail scale factors:', { x: thumbnailScaleX, y: thumbnailScaleY });
  
  // Convert scaled bounds back to logical coordinates
  const logicalBounds = {
    x: scaledBounds.x / displayInfo.scaleFactor,
    y: scaledBounds.y / displayInfo.scaleFactor,
    width: scaledBounds.width / displayInfo.scaleFactor,
    height: scaledBounds.height / displayInfo.scaleFactor
  };
  
  console.log('🔍 Logical bounds (unscaled):', logicalBounds);
  
  // Apply thumbnail scaling to logical coordinates
  const thumbnailBounds = {
    x: Math.round(logicalBounds.x * thumbnailScaleX),
    y: Math.round(logicalBounds.y * thumbnailScaleY),
    width: Math.round(logicalBounds.width * thumbnailScaleX),
    height: Math.round(logicalBounds.height * thumbnailScaleY)
  };
  
  console.log('🔍 Final thumbnail bounds for cropping:', thumbnailBounds);
  
  // Validate bounds
  if (thumbnailBounds.x < 0 || thumbnailBounds.y < 0 || 
      thumbnailBounds.x + thumbnailBounds.width > thumbnailSize.width ||
      thumbnailBounds.y + thumbnailBounds.height > thumbnailSize.height) {
    console.error('❌ Thumbnail bounds are out of range!');
    console.error('   Bounds:', thumbnailBounds);
    console.error('   Thumbnail size:', thumbnailSize);
  } else {
    console.log('✅ Thumbnail bounds are within valid range');
  }
  
  // Save the full screenshot for reference
  const thumbnailDataUrl = thumbnail.toDataURL();
  const fullImagePath = path.join(__dirname, 'temp', `debug_full_${Date.now()}.png`);
  const base64Data = thumbnailDataUrl.replace(/^data:image\/png;base64,/, '');
  
  // Ensure temp directory exists
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  fs.writeFileSync(fullImagePath, base64Data, 'base64');
  console.log('💾 Full screenshot saved to:', fullImagePath);
  
  console.log('🎯 Summary:');
  console.log('   Original selection:', overlayBounds);
  console.log('   Thumbnail crop area:', thumbnailBounds);
  console.log('   Crop area as percentage of thumbnail:');
  console.log('     X: ' + ((thumbnailBounds.x / thumbnailSize.width) * 100).toFixed(2) + '%');
  console.log('     Y: ' + ((thumbnailBounds.y / thumbnailSize.height) * 100).toFixed(2) + '%');
  console.log('     Width: ' + ((thumbnailBounds.width / thumbnailSize.width) * 100).toFixed(2) + '%');
  console.log('     Height: ' + ((thumbnailBounds.height / thumbnailSize.height) * 100).toFixed(2) + '%');
}

// Run the test
testCapture().catch(console.error);