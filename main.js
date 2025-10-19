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
    language: "eng",
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
    console.log("🎯 Final permission status:", hasPermission);

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
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
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
    console.log("🎯 Starting area capture mode with system-wide overlay");

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

  // Get primary display dimensions
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Create overlay window
  const overlayWindow = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
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

    // Save temporary file with timestamp to avoid conflicts
    const timestamp = Date.now();
    const tempPath = path.join(tempDir, `capture_${timestamp}.png`);
    fs.writeFileSync(tempPath, buffer);

    console.log("💾 Temporary image saved:", tempPath);

    // Verify file was written correctly
    const stats = fs.statSync(tempPath);
    console.log("📊 Saved file size:", stats.size, "bytes");

    if (stats.size === 0) {
      throw new Error("Saved image file is empty");
    }

    // Get selected language from store
    const selectedLanguage = store.get("language");
    console.log("🌐 Selected language:", selectedLanguage);

    // Process with Tesseract with enhanced options
    console.log("🔍 Starting Tesseract OCR...");
    const {
      data: { text, confidence },
    } = await Tesseract.recognize(tempPath, selectedLanguage, {
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

    // Clean up temp file
    try {
      fs.unlinkSync(tempPath);
      console.log("🗑️ Temporary file cleaned up");
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

// IPC handlers for capture window with comprehensive error handling
ipcMain.on("area-selected", async (event, data) => {
  console.log("📤 Area selected event received");
  console.log("📊 Data received:", {
    hasBounds: !!data?.bounds,
    bounds: data?.bounds,
  });

  try {
    // Process area capture with bounds
    if (data?.bounds) {
      try {
        console.log("🔄 Starting area capture with bounds...");

        // Hide overlay window before capture to avoid capturing it
        if (captureWindow && !captureWindow.isDestroyed()) {
          console.log("🙈 Hiding overlay window for capture");
          captureWindow.hide();
        }

        // Wait a moment for the overlay to fully hide
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get desktop sources directly in main process
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: 3840, height: 2160 }, // Higher resolution for better quality
        });

        if (sources.length === 0) {
          throw new Error("No screen sources available");
        }

        console.log(`📺 Found ${sources.length} screen sources`);

        // Get display info for scaling
        const primaryDisplay = screen.getPrimaryDisplay();
        const scaleFactor = primaryDisplay.scaleFactor;

        // Scale the bounds for high DPI displays
        const scaledBounds = {
          x: Math.round(data.bounds.x * scaleFactor),
          y: Math.round(data.bounds.y * scaleFactor),
          width: Math.round(data.bounds.width * scaleFactor),
          height: Math.round(data.bounds.height * scaleFactor),
        };

        console.log("📏 Original bounds:", data.bounds);
        console.log("📏 Scaled bounds:", scaledBounds);
        console.log("📏 Scale factor:", scaleFactor);

        // Use the primary screen source (usually the first one)
        const primarySource = sources[0];
        const thumbnail = primarySource.thumbnail;

        // Convert thumbnail to image data
        const thumbnailDataUrl = thumbnail.toDataURL();

        // Create a simple image processing function
        const processImage = () => {
          return new Promise((resolve, reject) => {
            console.log("🖼️ Creating image processing window...");

            // Create a hidden window for image processing
            const processingWin = new BrowserWindow({
              show: false,
              webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
                webSecurity: false, // Allow data URLs
              },
            });

            console.log("✅ Image processing window created");

            // Handle processing result
            console.log("🔗 Setting up IPC handlers for image processing...");
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
              console.log("🎯 Image processor ready, sending data...");
              processingWin.webContents.send("process-image", {
                bounds: scaledBounds,
                imageDataUrl: thumbnailDataUrl,
              });
            });

            // Load HTML file for image processing
            console.log("📄 Loading image processor HTML file...");
            processingWin.loadFile(path.join(__dirname, "image-processor.html"));
          });
        };

        console.log("🎯 Starting image processing...");
        const imageData = await processImage();
        console.log(
          "✅ Area capture completed successfully, image data length:",
          imageData.length
        );

        // Send capture preview to main window
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            // imageData is already a base64 data URL from canvas.toDataURL()
            mainWindow.webContents.send("capture-preview", imageData, {
              width: scaledBounds.width,
              height: scaledBounds.height
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
          mainWindow.webContents.send(
            "ocr-error",
            `Capture failed: ${captureError.message}`
          );
        }
      }
    } else {
      console.error("❌ No bounds data received");
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("ocr-error", "No capture area specified");
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
