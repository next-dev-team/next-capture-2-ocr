// Simple test to verify capture functionality in main process
const { app, BrowserWindow, desktopCapturer } = require('electron');

async function testCaptureInMain() {
  console.log("🧪 Testing capture in main process...");
  
  try {
    console.log("📸 Getting desktop sources...");
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: 1920,
        height: 1080
      }
    });
    
    console.log("🖥️ Desktop sources found:", sources.length);
    
    if (sources.length > 0) {
      const source = sources[0];
      console.log("✅ First source:", {
        id: source.id,
        name: source.name,
        display_id: source.display_id
      });
      
      const screenshot = source.thumbnail;
      console.log("📷 Screenshot size:", screenshot.getSize());
      
      // Test cropping a small area
      const testBounds = {
        x: 100,
        y: 100,
        width: 200,
        height: 100
      };
      
      console.log("✂️ Testing crop with bounds:", testBounds);
      const croppedImage = screenshot.crop(testBounds);
      console.log("✅ Cropped image size:", croppedImage.getSize());
      
      const imageData = croppedImage.toPNG();
      console.log("💾 Image data size:", imageData.length, "bytes");
      
      console.log("🎉 Main process capture test PASSED");
      return true;
    } else {
      console.log("❌ No desktop sources found in main process");
      return false;
    }
  } catch (error) {
    console.error("❌ Main process capture test FAILED:", error);
    console.error("❌ Error name:", error.name);
    console.error("❌ Error message:", error.message);
    console.error("❌ Error stack:", error.stack);
    return false;
  }
}

// Run test when app is ready
app.whenReady().then(async () => {
  console.log("🚀 App ready, running capture test...");
  await testCaptureInMain();
  app.quit();
});

app.on('window-all-closed', () => {
  app.quit();
});