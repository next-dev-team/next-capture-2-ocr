const {
  app,
  BrowserWindow,
  globalShortcut,
  screen,
  ipcMain,
  clipboard,
  desktopCapturer,
  systemPreferences,
  shell,
} = require("electron");
const path = require("path");
const Tesseract = require("tesseract.js");
const Store = require("electron-store");

// Initialize configuration store
const store = new Store({
  defaults: {
    language: "auto",
    shortcutKey: "CommandOrControl+Shift+2",
    permissionsGranted: false,
    captureMode: "area", // "fullscreen" or "area"
    autoCopy: true,
    windowBounds: {
      width: 380,
      height: 580,
      x: null,
      y: null,
    },
  },
});

let mainWindow = null;
let captureWindow = null;

// Supported OCR languages
const supportedLanguages = [
  { code: "auto", name: "Auto-detect", flag: "🌍" },
  { code: "eng", name: "English", flag: "🇺🇸" },
  { code: "km", name: "Khmer", flag: "🇰🇭" },
  { code: "chi_sim", name: "Chinese (Simplified)", flag: "🇨🇳" },
  { code: "spa", name: "Spanish", flag: "🇪🇸" },
  { code: "fra", name: "French", flag: "🇫🇷" },
  { code: "deu", name: "German", flag: "🇩🇪" },
  { code: "jpn", name: "Japanese", flag: "🇯🇵" },
  { code: "kor", name: "Korean", flag: "🇰🇷" },
];

async function checkScreenRecordingPermission() {
  console.log("🔍 Checking screen recording permission...");

  if (process.platform !== "darwin") {
    console.log("✅ Non-macOS platform, permission granted by default");
    return true;
  }

  const mediaStatus = systemPreferences.getMediaAccessStatus("screen");
  console.log("📱 Media access status:", mediaStatus);

  // Also test with desktopCapturer to be sure
  try {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 10, height: 10 },
    });

    const hasAccess = sources && sources.length > 0;
    console.log(
      "🖥️ Desktop capturer test - sources found:",
      sources?.length || 0
    );
    console.log("✅ Desktop capturer access:", hasAccess);

    const hasPermission = mediaStatus === "granted" && hasAccess;
    store.set("permissionsGranted", hasPermission);

    return hasPermission;
  } catch (error) {
    console.error("❌ Error testing desktop capturer:", error);
    const hasPermission = mediaStatus === "granted";
    store.set("permissionsGranted", hasPermission);
    return hasPermission;
  }
}

async function requestScreenRecordingPermission() {
  if (process.platform !== "darwin") {
    return true;
  }

  try {
    // For screen recording permissions, we need to check if the app has access
    // by attempting to get screen sources. If it fails, the user needs to manually
    // grant permission in System Preferences
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1, height: 1 },
    });

    const hasPermission = sources && sources.length > 0;
    store.set("permissionsGranted", hasPermission);

    if (!hasPermission) {
      // Show a dialog or notification to guide user to System Preferences
      console.log(
        "Screen recording permission required. Please enable in System Preferences > Security & Privacy > Screen Recording"
      );
    }

    return hasPermission;
  } catch (error) {
    console.error("Permission request failed:", error);
    store.set("permissionsGranted", false);
    return false;
  }
}

function createMainWindow() {
  const bounds = store.get("windowBounds");

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    center: true,

    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    titleBarStyle: "hiddenInset",
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
  });

  // Register main window with capture manager
  captureManager.registerWindow(mainWindow, "main");

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.on("resize", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      store.set("windowBounds", bounds);
    }
  });

  mainWindow.on("move", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const bounds = mainWindow.getBounds();
      store.set("windowBounds", bounds);
    }
  });
}

// Capture window creation function removed - now using integrated drag selection in main window

// IPC Handlers
ipcMain.handle("get-config", () => {
  return {
    language: store.get("language"),
    shortcutKey: store.get("shortcutKey"),
    permissionsGranted: store.get("permissionsGranted"),
    captureMode: store.get("captureMode"),
    autoCopy: store.get("autoCopy"),
    supportedLanguages,
  };
});

ipcMain.handle("set-language", (event, language) => {
  store.set("language", language);
  return true;
});

ipcMain.handle("set-config", (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle("check-permissions", async () => {
  const hasPermission = await checkScreenRecordingPermission();
  return hasPermission;
});

ipcMain.handle("request-permissions", async () => {
  const granted = await requestScreenRecordingPermission();
  return granted;
});

ipcMain.handle("open-system-preferences", async () => {
  try {
    // Open System Preferences to the Screen Recording section
    await shell.openExternal(
      "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"
    );
    return true;
  } catch (error) {
    console.error("Failed to open System Preferences:", error);
    return false;
  }
});

ipcMain.handle("get-display-info", async () => {
  try {
    const displays = screen.getAllDisplays();
    return displays.map((display) => ({
      id: display.id,
      bounds: display.bounds,
      workArea: display.workArea,
      scaleFactor: display.scaleFactor,
      rotation: display.rotation,
      touchSupport: display.touchSupport,
    }));
  } catch (error) {
    console.error("Failed to get display info:", error);
    return [];
  }
});

ipcMain.on("start-capture", async () => {
  console.log("🚀 Starting capture process...");

  const hasPermission = await checkScreenRecordingPermission();
  console.log("📋 Screen recording permission:", hasPermission);

  if (!hasPermission) {
    console.log("❌ No screen recording permission");
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send("permission-denied");
      } catch (error) {
        console.error("Failed to send permission-denied:", error);
      }
    }
    return;
  }

  // Get capture mode from store
  const captureMode = store.get("captureMode");
  console.log("📸 Capture mode:", captureMode);

  if (captureMode === "fullscreen") {
    console.log("🖥️ Starting fullscreen capture");
    // Hide main window before capture to avoid capturing own app
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.log("🙈 Hiding main window");
      mainWindow.hide();
    }

    // Wait for window to fully hide and for other apps to be visible
    setTimeout(async () => {
      console.log("⏰ Timeout completed, proceeding with fullscreen capture");
      await captureFullScreen();
    }, 300);
  } else {
    // Hide main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide();
    }

    // Create system-wide overlay window for area selection
    createOverlayWindow();
  }
});

// Create system-wide overlay window for area selection
function createOverlayWindow() {
  console.log("🌐 Creating system-wide overlay window");

  // Get primary display dimensions and bounds
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.bounds;
  const { x: displayX, y: displayY } = primaryDisplay.bounds;
  const workArea = primaryDisplay.workArea;

  console.log("📺 Display bounds:", {
    x: displayX,
    y: displayY,
    width,
    height,
  });
  console.log("📺 Work area:", workArea);

  // Create overlay window positioned at work area to avoid menu bar
  const overlayWindow = new BrowserWindow({
    width: workArea.width,
    height: workArea.height,
    x: workArea.x,
    y: workArea.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    fullscreen: false,
    kiosk: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      backgroundThrottling: false,
    },
  });

  // Make window ignore mouse events except for selection
  overlayWindow.setIgnoreMouseEvents(false);

  // Register the overlay window with capture manager
  captureManager.setOverlayWindow(overlayWindow);

  // Load overlay HTML
  overlayWindow.loadFile(path.join(__dirname, "overlay.html"));

  // Handle overlay events
  overlayWindow.on("closed", () => {
    console.log("🔒 Overlay window closed");
    // Show main window when overlay is closed
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Store reference for cleanup
  captureWindow = overlayWindow;

  console.log("✅ System-wide overlay window created");
}

// Add new function for direct screen capture
async function captureFullScreen() {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send("processing-ocr");
      } catch (error) {
        console.error("Failed to send processing-ocr:", error);
      }
    }

    // Get screen sources
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width:
          screen.getPrimaryDisplay().workAreaSize.width *
          screen.getPrimaryDisplay().scaleFactor,
        height:
          screen.getPrimaryDisplay().workAreaSize.height *
          screen.getPrimaryDisplay().scaleFactor,
      },
    });

    if (sources.length === 0) {
      throw new Error("No screen sources available");
    }

    // Use the primary screen
    const screenshot = sources[0].thumbnail;
    const imageData = screenshot.toPNG();

    // Process OCR directly
    await processOCR(Array.from(imageData));
  } catch (error) {
    console.error("Screen capture error:", error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.show();
        mainWindow.webContents.send(
          "ocr-error",
          `Capture failed: ${error.message}`
        );
      } catch (sendError) {
        console.error("Failed to send ocr-error:", sendError);
      }
    }
  }
}

// Extract OCR processing into separate function
async function processOCR(imageData) {
  console.log("🔍 Processing OCR with enhanced error handling...");

  try {
    if (!imageData) {
      throw new Error("No image data provided");
    }

    console.log("📊 Image data type:", typeof imageData);
    console.log(
      "📊 Image data length:",
      Array.isArray(imageData) ? imageData.length : imageData.length
    );

    let buffer;

    // Handle different image data formats
    if (typeof imageData === "string") {
      // Handle data URL format (from drag area capture)
      if (imageData.startsWith("data:image/")) {
        console.log("📝 Processing data URL format");
        const base64Data = imageData.replace(/^data:image\/[^;]+;base64,/, "");
        if (!base64Data) {
          throw new Error("Invalid data URL format");
        }
        buffer = Buffer.from(base64Data, "base64");
      } else {
        // Handle base64 string
        console.log("📝 Processing base64 string format");
        buffer = Buffer.from(imageData, "base64");
      }
    } else if (Array.isArray(imageData)) {
      // Handle array format (from fullscreen capture)
      console.log("📝 Processing array format");
      buffer = Buffer.from(imageData);
    } else {
      throw new Error("Unsupported image data format");
    }

    console.log("💾 Image buffer size:", buffer.length, "bytes");

    if (buffer.length === 0) {
      throw new Error("Image buffer is empty");
    }

    // Create temp directory if it doesn't exist
    const fs = require("fs");
    const tempDir = path.join(__dirname, "temp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create debug directory for permanent image storage
    const debugDir = path.join(__dirname, "debug-images");
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    // Save temporary file with timestamp to avoid conflicts
    const timestamp = Date.now();
    const tempPath = path.join(tempDir, `capture_${timestamp}.png`);
    const debugPath = path.join(debugDir, `debug_capture_${timestamp}.png`);

    fs.writeFileSync(tempPath, buffer);
    fs.writeFileSync(debugPath, buffer);

    console.log("💾 Temporary image saved:", tempPath);
    console.log("💾 Debug image saved permanently:", debugPath);

    // Verify file was written correctly
    const stats = fs.statSync(tempPath);
    console.log("📊 Saved file size:", stats.size, "bytes");

    if (stats.size === 0) {
      throw new Error("Saved image file is empty");
    }

    // Get selected language from store
    const selectedLanguage = store.get("language");
    console.log("🌐 Selected language:", selectedLanguage);

    let finalLanguage = selectedLanguage;

    // Handle auto-detection properly
    if (selectedLanguage === "auto") {
      console.log("🔍 Attempting automatic language detection...");
      try {
        // First, try to detect orientation and script
        const detectionResult = await Tesseract.detect(tempPath);
        console.log("📊 Detection result:", detectionResult);

        if (
          detectionResult &&
          detectionResult.data &&
          detectionResult.data.script
        ) {
          const detectedScript = detectionResult.data.script;
          console.log("📝 Detected script:", detectedScript);

          // Map common scripts to languages
          const scriptToLanguage = {
            Latin: "eng",
            Han: "chi_sim",
            Hiragana: "jpn",
            Katakana: "jpn",
            Hangul: "kor",
            Arabic: "ara",
            Devanagari: "hin",
            Cyrillic: "rus",
            Khmer: "km",
            Cambodia: "km",
          };

          finalLanguage = scriptToLanguage[detectedScript] || "eng";
        } else {
          console.log("⚠️ Script detection failed, falling back to English");
          finalLanguage = "eng";
        }
      } catch (detectionError) {
        console.warn("⚠️ Auto-detection failed:", detectionError.message);
        console.log("🔄 Falling back to English for OCR");
        finalLanguage = "eng";
      }
    }

    // Process with Tesseract with enhanced options
    console.log("🔍 Starting Tesseract OCR with language:", finalLanguage);
    const {
      data: { text, confidence },
    } = await Tesseract.recognize(tempPath, finalLanguage, {
      logger: (m) => {
        if (m.status === "recognizing text") {
          console.log(
            `🔍 Tesseract progress: ${Math.round(m.progress * 100)}%`
          );
          if (mainWindow && !mainWindow.isDestroyed()) {
            try {
              mainWindow.webContents.send("ocr-progress", m);
            } catch (error) {
              console.error("Failed to send ocr-progress:", error);
            }
          }
        }
      },
      tessedit_pageseg_mode: Tesseract.PSM.AUTO,
      tessedit_ocr_engine_mode: Tesseract.OEM.LSTM_ONLY,
    });

    console.log("✅ OCR completed successfully");
    console.log("📊 OCR confidence:", confidence);
    console.log("📝 Extracted text length:", text.length);
    console.log(
      "📝 Extracted text preview:",
      text.substring(0, 100) + (text.length > 100 ? "..." : "")
    );

    // Clean up temp file (keep debug image)
    try {
      fs.unlinkSync(tempPath);
      console.log("🗑️ Temporary file cleaned up (debug image preserved)");
    } catch (cleanupError) {
      console.warn("⚠️ Failed to clean up temp file:", cleanupError.message);
    }

    // Validate extracted text
    if (!text || text.trim().length === 0) {
      console.warn("⚠️ No text extracted from image");
      throw new Error(
        "No text found in the selected area. Please try selecting an area with visible text."
      );
    }

    const trimmedText = text.trim();

    // Copy to clipboard if auto-copy is enabled
    const autoCopy = store.get("autoCopy");
    if (autoCopy) {
      clipboard.writeText(trimmedText);
    }

    // Always show the main window with results after area capture
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("ocr-complete", trimmedText);
        console.log("👁️ Main window shown with extracted text");
      } catch (error) {
        console.error("Failed to send ocr-complete:", error);
      }
    }
  } catch (error) {
    console.error("❌ OCR processing failed:", error);
    console.error("❌ Error stack:", error.stack);

    // Send detailed error to main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      const errorMessage = error.message || "Unknown OCR error occurred";
      try {
        mainWindow.show();
        mainWindow.webContents.send("ocr-error", errorMessage);
        console.log("📤 OCR error sent to main window:", errorMessage);
      } catch (sendError) {
        console.error("Failed to send ocr-error:", sendError);
      }
    }

    // Re-throw error for upstream handling
    throw error;
  }
}

// ===== COORDINATE SYSTEM MANAGER =====
class CoordinateSystemManager {
  constructor() {
    this.displayInfo = null;
    this.overlayBounds = null;
  }

  async initialize() {
    const primaryDisplay = screen.getPrimaryDisplay();
    this.displayInfo = {
      scaleFactor: primaryDisplay.scaleFactor,
      bounds: primaryDisplay.bounds,
      workArea: primaryDisplay.workArea,
      menuBarHeight:
        primaryDisplay.bounds.y +
        (primaryDisplay.bounds.height -
          primaryDisplay.workArea.height -
          primaryDisplay.workArea.y),
    };

    console.log("📐 Coordinate system initialized:", this.displayInfo);
    return this.displayInfo;
  }

  setOverlayBounds(bounds) {
    this.overlayBounds = bounds;
  }

  transformBounds(rawBounds) {
    if (!this.displayInfo) {
      throw new Error("Coordinate system not initialized");
    }

    console.log("🔍 DEBUG: Raw bounds from drag:", rawBounds);
    console.log("🔍 DEBUG: Overlay bounds set?", !!this.overlayBounds);
    console.log("🔍 DEBUG: Display info:", this.displayInfo);

    // FIXED: Proper coordinate handling for overlay window
    let actualBounds;

    if (this.overlayBounds) {
      // The coordinates from overlay.html are already in global screen coordinates
      // They are already correct and don't need menu bar adjustment
      actualBounds = {
        x: rawBounds.x,
        y: rawBounds.y, // NO menu bar adjustment needed - overlay gives global coords
        width: rawBounds.width,
        height: rawBounds.height,
      };
      console.log("🔍 DEBUG: Using overlay coordinates (already global)");
    } else {
      // For main window drag selection, coordinates are relative to the window
      // We need to add the work area offset to convert to global coordinates
      actualBounds = {
        x: rawBounds.x + this.displayInfo.workArea.x,
        y: rawBounds.y + this.displayInfo.workArea.y,
        width: rawBounds.width,
        height: rawBounds.height,
      };
      console.log(
        "🔍 DEBUG: Using main window coordinates, adjusted for work area"
      );
    }

    console.log("🔍 DEBUG: Actual bounds after adjustment:", actualBounds);

    // Scale for high DPI displays
    const scaledBounds = {
      x: Math.round(actualBounds.x * this.displayInfo.scaleFactor),
      y: Math.round(actualBounds.y * this.displayInfo.scaleFactor),
      width: Math.round(actualBounds.width * this.displayInfo.scaleFactor),
      height: Math.round(actualBounds.height * this.displayInfo.scaleFactor),
    };

    console.log("🔍 DEBUG: Scaled bounds for capture:", scaledBounds);

    return { actualBounds, scaledBounds };
  }

  logDebugInfo(rawBounds) {
    console.log("🖥️ Display info:");
    console.log("  Display bounds:", this.displayInfo.bounds);
    console.log("  Work area:", this.displayInfo.workArea);
    console.log("  Menu bar height:", this.displayInfo.menuBarHeight);
    console.log("  Scale factor:", this.displayInfo.scaleFactor);
    console.log("  Overlay bounds:", this.overlayBounds);
  }
}

// ===== SELF-CAPTURE PREVENTION MANAGER =====
class SelfCapturePreventionManager {
  constructor() {
    this.appWindows = new Set();
    this.overlayWindow = null;
  }

  registerWindow(window, type = "main") {
    this.appWindows.add({ window, type });
    console.log(`🛡️ Registered ${type} window for self-capture prevention`);
  }

  setOverlayWindow(window) {
    this.overlayWindow = window;
    console.log("🛡️ Overlay window registered for self-capture prevention");
  }

  async hideAllAppWindows() {
    console.log("🙈 Hiding all application windows to prevent self-capture");

    const hidePromises = [];

    // Hide overlay window first
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      hidePromises.push(
        new Promise((resolve) => {
          this.overlayWindow.hide();
          setTimeout(resolve, 50);
        })
      );
    }

    // Hide other app windows
    for (const { window, type } of this.appWindows) {
      if (window && !window.isDestroyed() && window.isVisible()) {
        hidePromises.push(
          new Promise((resolve) => {
            window.hide();
            console.log(`🙈 Hidden ${type} window`);
            setTimeout(resolve, 50);
          })
        );
      }
    }

    await Promise.all(hidePromises);

    // Additional delay to ensure windows are fully hidden
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log("✅ All application windows hidden");
  }

  async restoreAppWindows() {
    console.log("👁️ Restoring application windows");

    for (const { window, type } of this.appWindows) {
      if (window && !window.isDestroyed()) {
        window.show();
        console.log(`👁️ Restored ${type} window`);
      }
    }
  }

  isAppWindow(bounds) {
    // Check if the capture bounds overlap with any visible app window
    for (const { window } of this.appWindows) {
      if (window && !window.isDestroyed() && window.isVisible()) {
        const windowBounds = window.getBounds();
        if (this.boundsOverlap(bounds, windowBounds)) {
          console.log("⚠️ Detected potential self-capture attempt");
          return true;
        }
      }
    }
    return false;
  }

  boundsOverlap(bounds1, bounds2) {
    return !(
      bounds1.x + bounds1.width < bounds2.x ||
      bounds2.x + bounds2.width < bounds1.x ||
      bounds1.y + bounds1.height < bounds2.y ||
      bounds2.y + bounds2.height < bounds1.y
    );
  }
}

// ===== CAPTURE MANAGER =====
class CaptureManager {
  constructor() {
    this.coordinateSystem = new CoordinateSystemManager();
    this.selfCapturePreventionManager = new SelfCapturePreventionManager();
  }

  async initialize() {
    await this.coordinateSystem.initialize();
  }

  registerWindow(window, type) {
    this.selfCapturePreventionManager.registerWindow(window, type);
  }

  setOverlayWindow(window) {
    this.selfCapturePreventionManager.setOverlayWindow(window);
    this.coordinateSystem.setOverlayBounds(window.getBounds());
  }

  async processAreaCapture(bounds) {
    // Initialize coordinate system
    await this.coordinateSystem.initialize();

    // Log debug information
    this.coordinateSystem.logDebugInfo(bounds);

    // Transform coordinates
    const { actualBounds, scaledBounds } =
      this.coordinateSystem.transformBounds(bounds);

    // Check for self-capture
    if (this.selfCapturePreventionManager.isAppWindow(actualBounds)) {
      console.log("🚫 Self-capture detected, aborting");
      throw new Error("Cannot capture application windows");
    }

    // Hide all app windows
    await this.selfCapturePreventionManager.hideAllAppWindows();

    try {
      // Perform the actual capture
      const imageData = await this.captureScreen(scaledBounds);

      // Restore app windows
      await this.selfCapturePreventionManager.restoreAppWindows();

      return imageData;
    } catch (error) {
      // Ensure windows are restored even on error
      await this.selfCapturePreventionManager.restoreAppWindows();
      throw error;
    }
  }

  async captureScreen(scaledBounds) {
    console.log("📸 Capturing screen with bounds:", scaledBounds);

    // Get desktop sources
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 3840, height: 2160 },
    });

    if (sources.length === 0) {
      throw new Error("No screen sources available");
    }

    console.log(`📺 Found ${sources.length} screen sources`);

    // Use the primary screen source
    const primarySource = sources[0];
    const thumbnail = primarySource.thumbnail;
    const thumbnailDataUrl = thumbnail.toDataURL();

    // Get actual thumbnail dimensions
    const thumbnailSize = thumbnail.getSize();
    console.log("🖼️ Thumbnail dimensions:", thumbnailSize);

    // Get screen dimensions - IMPORTANT: Use the actual display bounds, not screen.getPrimaryDisplay()
    const displayInfo = this.coordinateSystem.displayInfo;
    const screenBounds = displayInfo.bounds;
    console.log("🖥️ Screen dimensions (from display info):", screenBounds);

    // Calculate scaling factor between thumbnail and screen
    const thumbnailScaleX = thumbnailSize.width / screenBounds.width;
    const thumbnailScaleY = thumbnailSize.height / screenBounds.height;

    console.log("📏 Thumbnail scale factors:", {
      x: thumbnailScaleX,
      y: thumbnailScaleY,
    });

    // IMPORTANT: The scaledBounds are already scaled by displayInfo.scaleFactor
    // We need to convert them back to logical coordinates before applying thumbnail scaling
    const logicalBounds = {
      x: scaledBounds.x / displayInfo.scaleFactor,
      y: scaledBounds.y / displayInfo.scaleFactor,
      width: scaledBounds.width / displayInfo.scaleFactor,
      height: scaledBounds.height / displayInfo.scaleFactor,
    };

    console.log("🔍 DEBUG: Logical bounds (unscaled):", logicalBounds);

    // Now apply thumbnail scaling to logical coordinates
    const thumbnailBounds = {
      x: Math.round(logicalBounds.x * thumbnailScaleX),
      y: Math.round(logicalBounds.y * thumbnailScaleY),
      width: Math.round(logicalBounds.width * thumbnailScaleX),
      height: Math.round(logicalBounds.height * thumbnailScaleY),
    };

    console.log(
      "🔍 DEBUG: Final thumbnail bounds for cropping:",
      thumbnailBounds
    );

    // Process the image with adjusted bounds
    return await this.processImage(thumbnailBounds, thumbnailDataUrl);
  }

  async processImage(bounds, imageDataUrl) {
    return new Promise((resolve, reject) => {
      console.log("🖼️ Creating image processing window...");

      const processingWin = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false,
        },
      });

      console.log("✅ Image processing window created");

      // Handle processing result
      ipcMain.once("image-processing-complete", (event, imageData) => {
        console.log(
          "✅ Image processing completed, data length:",
          imageData.length
        );
        processingWin.close();
        resolve(imageData);
      });

      ipcMain.once("image-processing-error", (event, error) => {
        console.error("❌ Image processing error:", error);
        processingWin.close();
        reject(new Error(error));
      });

      ipcMain.once("image-processor-ready", () => {
        processingWin.webContents.send("process-image", {
          bounds,
          imageDataUrl,
        });
      });

      // Load the image processor
      processingWin.loadFile(path.join(__dirname, "image-processor.html"));
    });
  }
}

// Global instances
const captureManager = new CaptureManager();

// Enhanced IPC handlers for window visibility control
ipcMain.on("hide-main-window", () => {
  console.log("🙈 Hiding main window for drag capture");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
});

ipcMain.on("show-main-window", () => {
  console.log("👁️ Showing main window after drag capture");
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// Enhanced IPC handlers for area capture with proper coordinate handling
ipcMain.on("area-selected", async (event, data) => {
  console.log("📤 Area selected event received");
  console.log("📊 Data received:", data);

  try {
    // Handle both old format (data.bounds) and new format (direct coordinates)
    let bounds;
    if (data?.bounds) {
      bounds = data.bounds;
    } else if (
      data?.x !== undefined &&
      data?.y !== undefined &&
      data?.width !== undefined &&
      data?.height !== undefined
    ) {
      bounds = {
        x: data.x,
        y: data.y,
        width: data.width,
        height: data.height,
      };
    } else {
      console.error("❌ Invalid coordinate data received:", data);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(
          "ocr-error",
          "Invalid capture area coordinates"
        );
      }
      return;
    }

    // Determine coordinate system based on the sender
    const isFromOverlay = event.sender !== mainWindow?.webContents;
    console.log(
      "📍 Coordinate source:",
      isFromOverlay ? "overlay window" : "main window"
    );
    console.log("📍 Event sender ID:", event.sender.id);
    console.log("📍 Main window webContents ID:", mainWindow?.webContents?.id);
    console.log("📍 Capture window exists:", !!captureWindow);
    console.log(
      "📍 Capture window webContents ID:",
      captureWindow?.webContents?.id
    );

    // FIXED: Properly detect if coordinates are from overlay window
    // The overlay window (captureWindow) sends coordinates that are already in global screen coordinates
    // The main window sends coordinates that are relative to the window and need work area offset
    const isFromCaptureOverlay =
      captureWindow &&
      !captureWindow.isDestroyed() &&
      event.sender === captureWindow.webContents;

    console.log(
      "📍 CORRECTED - Is from capture overlay:",
      isFromCaptureOverlay
    );

    // Set coordinate system context for the capture manager
    if (isFromCaptureOverlay) {
      console.log("📍 Setting overlay bounds (global coordinates)");
      captureManager.coordinateSystem.setOverlayBounds(bounds);
    } else {
      console.log("📍 Setting main window bounds (needs work area offset)");
      captureManager.coordinateSystem.setOverlayBounds(null);
    }

    try {
      console.log("🔄 Starting enhanced area capture...");

      // Process the capture using the new capture manager
      const imageData = await captureManager.processAreaCapture(bounds);
      console.log(
        "✅ Area capture completed successfully, image data length:",
        imageData.length
      );

      // Send capture preview to main window
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          // imageData is already a base64 data URL from canvas.toDataURL()
          mainWindow.webContents.send("capture-preview", imageData, {
            width: bounds.width,
            height: bounds.height,
          });
          console.log("📸 Capture preview sent to main window");
        } catch (previewError) {
          console.error("❌ Failed to send capture preview:", previewError);
        }
      }

      // Process OCR
      console.log("🔍 Starting OCR processing...");
      await processOCR(imageData);
      console.log("✅ OCR processing completed successfully");
    } catch (captureError) {
      console.error("❌ Area capture failed:", captureError);
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Provide more user-friendly error messages
        let errorMessage = captureError.message;
        if (errorMessage.includes("Cannot capture application windows")) {
          errorMessage =
            "Cannot capture the application window itself. Please select a different area.";
        }
        mainWindow.webContents.send(
          "ocr-error",
          `Capture failed: ${errorMessage}`
        );
      }
    }

    // Show main window safely
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      console.log("👁️ Main window shown and focused");
    }

    // Close overlay window after successful capture
    if (captureWindow && !captureWindow.isDestroyed()) {
      console.log("🔒 Closing overlay window after capture");
      captureWindow.close();
      captureWindow = null;
    }
  } catch (error) {
    console.error("❌ Error handling area-selected:", error);

    // Close overlay window on error too
    if (captureWindow && !captureWindow.isDestroyed()) {
      console.log("🔒 Closing overlay window after error");
      captureWindow.close();
      captureWindow = null;
    }

    // Try to show main window even if other operations failed
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.show();
        mainWindow.webContents.send(
          "ocr-error",
          `Capture processing failed: ${error.message}`
        );
      } catch (fallbackError) {
        console.error("❌ Fallback error handling failed:", fallbackError);
      }
    }
  }
});

ipcMain.on("cancel-capture", (event) => {
  console.log("❌ Capture cancelled by user");

  try {
    // Close capture window safely
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.close();
      console.log("🔒 Capture window closed after cancel");
    }

    // Show main window safely
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      console.log("👁️ Main window restored after cancel");
    }
  } catch (error) {
    console.error("❌ Error handling cancel-capture:", error);

    // Emergency fallback - try to show main window
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.show();
      } catch (fallbackError) {
        console.error("❌ Emergency fallback failed:", fallbackError);
      }
    }
  }
});

// Add new IPC handler for capture errors
ipcMain.on("capture-error", (event, errorMessage) => {
  console.error("❌ Capture error reported from renderer:", errorMessage);

  try {
    // Close capture window on error
    if (captureWindow && !captureWindow.isDestroyed()) {
      captureWindow.close();
      console.log("🔒 Capture window closed due to error");
    }

    // Show main window and display error
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send(
        "ocr-error",
        `Capture failed: ${errorMessage}`
      );
      console.log("👁️ Main window shown with error message");
    }
  } catch (error) {
    console.error("❌ Error handling capture-error:", error);
  }
});

app.whenReady().then(async () => {
  // Check permissions on startup
  await checkScreenRecordingPermission();

  createMainWindow();

  const shortcutKey = store.get("shortcutKey");
  globalShortcut.register(shortcutKey, () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        mainWindow.webContents.send("trigger-capture");
      } catch (error) {
        console.error("Failed to send trigger-capture:", error);
      }
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
