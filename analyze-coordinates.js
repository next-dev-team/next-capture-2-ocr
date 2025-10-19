// Analyze coordinate transformation based on recent logs
console.log('🔍 Analyzing coordinate transformation from recent logs...');

// Data from the recent capture attempt (from logs)
const overlayBounds = { x: 591, y: 213, width: 231, height: 304 };
const displayInfo = {
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 25, width: 1440, height: 875 },
  scaleFactor: 2
};

console.log('📍 Original overlay bounds:', overlayBounds);
console.log('🖥️ Display info:', displayInfo);

// Current transformation logic
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

// Simulate thumbnail dimensions (from logs: 2880 x 1800)
const thumbnailSize = { width: 2880, height: 1800 };
console.log('🖼️ Thumbnail dimensions:', thumbnailSize);

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
console.log('\n🎯 Validation:');
console.log('   Thumbnail bounds within range?', 
  thumbnailBounds.x >= 0 && 
  thumbnailBounds.y >= 0 && 
  thumbnailBounds.x + thumbnailBounds.width <= thumbnailSize.width &&
  thumbnailBounds.y + thumbnailBounds.height <= thumbnailSize.height
);

console.log('   Crop area as percentage of thumbnail:');
console.log('     X: ' + ((thumbnailBounds.x / thumbnailSize.width) * 100).toFixed(2) + '%');
console.log('     Y: ' + ((thumbnailBounds.y / thumbnailSize.height) * 100).toFixed(2) + '%');
console.log('     Width: ' + ((thumbnailBounds.width / thumbnailSize.width) * 100).toFixed(2) + '%');
console.log('     Height: ' + ((thumbnailBounds.height / thumbnailSize.height) * 100).toFixed(2) + '%');

// Check if the crop area is too small
const cropAreaPixels = thumbnailBounds.width * thumbnailBounds.height;
console.log('   Crop area in pixels:', cropAreaPixels);
console.log('   Crop area reasonable?', cropAreaPixels > 1000); // At least 1000 pixels

// Analysis
console.log('\n📊 Analysis:');
if (logicalBounds.x === overlayBounds.x && logicalBounds.y === overlayBounds.y) {
  console.log('✅ Logical bounds match overlay bounds - coordinate transformation is correct');
} else {
  console.log('❌ Coordinate mismatch detected');
}

if (thumbnailBounds.width > 0 && thumbnailBounds.height > 0) {
  console.log('✅ Thumbnail bounds have positive dimensions');
} else {
  console.log('❌ Thumbnail bounds have zero or negative dimensions');
}

console.log('\n🔍 Potential issues:');
console.log('1. Are the thumbnail bounds too small for OCR?', thumbnailBounds.width < 50 || thumbnailBounds.height < 50);
console.log('2. Is the selected area mostly empty/background?', 'Unknown - need to check actual image');
console.log('3. Is the image quality sufficient for OCR?', 'Unknown - need to check actual image');