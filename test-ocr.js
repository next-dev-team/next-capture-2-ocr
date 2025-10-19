const Tesseract = require("tesseract.js");
const fs = require("fs");
const path = require("path");

// Simple test to verify OCR functionality
async function testOCR() {
  console.log("🧪 Starting OCR test...");
  
  try {
    // Create a simple test with a basic string
    const testText = "Hello World 123";
    console.log("📝 Expected text:", testText);
    
    // Test with a simple image buffer (we'll create a minimal test)
    // For now, let's test if Tesseract can initialize properly
    console.log("🤖 Testing Tesseract initialization...");
    
    // Test with a simple white image with black text
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(200, 50);
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 200, 50);
    
    // Black text
    ctx.fillStyle = 'black';
    ctx.font = '20px Arial';
    ctx.fillText(testText, 10, 30);
    
    const buffer = canvas.toBuffer('image/png');
    console.log("🖼️ Created test image buffer, size:", buffer.length);
    
    // Save test image for debugging
    fs.writeFileSync(path.join(__dirname, 'test-image.png'), buffer);
    console.log("💾 Saved test image as test-image.png");
    
    // Perform OCR
    console.log("🔍 Starting OCR recognition...");
    const result = await Tesseract.recognize(buffer, 'eng', {
      logger: m => console.log("📈", m.status, m.progress)
    });
    
    const recognizedText = result.data.text.trim();
    console.log("✅ OCR completed");
    console.log("📄 Recognized text:", `"${recognizedText}"`);
    console.log("🎯 Expected text:", `"${testText}"`);
    console.log("✨ Match:", recognizedText.includes("Hello") && recognizedText.includes("World"));
    
    return recognizedText;
    
  } catch (error) {
    console.error("❌ OCR test failed:", error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testOCR()
    .then(result => {
      console.log("🎉 Test completed successfully");
      process.exit(0);
    })
    .catch(error => {
      console.error("💥 Test failed:", error);
      process.exit(1);
    });
}

module.exports = { testOCR };