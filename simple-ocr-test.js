const Tesseract = require('tesseract.js');
const fs = require('fs');
const path = require('path');

async function testOCR() {
  console.log('🔍 Testing OCR functionality...');
  
  try {
    // Test with a simple text string
    const testText = "HELLO WORLD\nTEST TEXT\n123456";
    console.log('📝 Expected text:', testText);
    
    // Create a simple canvas-based image with text
    const { createCanvas } = require('canvas');
    const canvas = createCanvas(300, 150);
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, 300, 150);
    
    // Black text
    ctx.fillStyle = 'black';
    ctx.font = '24px Arial';
    ctx.fillText('HELLO WORLD', 20, 40);
    ctx.fillText('TEST TEXT', 20, 80);
    ctx.fillText('123456', 20, 120);
    
    // Save as PNG
    const buffer = canvas.toBuffer('image/png');
    const testImagePath = path.join(__dirname, 'temp', 'test-image.png');
    
    // Ensure temp directory exists
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(testImagePath, buffer);
    console.log('💾 Test image saved to:', testImagePath);
    
    // Run OCR on the test image
    console.log('🔍 Running OCR...');
    const { data: { text } } = await Tesseract.recognize(testImagePath, 'eng', {
      logger: m => console.log('📊 OCR Progress:', m)
    });
    
    console.log('✅ OCR completed');
    console.log('📝 Extracted text:', JSON.stringify(text));
    console.log('📝 Text length:', text.length);
    console.log('📝 Trimmed text:', JSON.stringify(text.trim()));
    
    // Clean up
    fs.unlinkSync(testImagePath);
    console.log('🗑️ Test image cleaned up');
    
    if (text.trim().length > 0) {
      console.log('✅ OCR is working correctly!');
    } else {
      console.log('❌ OCR failed to extract text');
    }
    
  } catch (error) {
    console.error('❌ OCR test failed:', error);
  }
}

testOCR();