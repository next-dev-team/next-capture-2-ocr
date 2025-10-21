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
  dialog,
} = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const os = require("os");
const Tesseract = require("tesseract.js");
const Store = require("electron-store");
const LanguageManager = require("./language-manager");

// Function to resolve traineddata files path for both development and production
function resolveTrainedDataPath() {
  const possiblePaths = [];
  
  try {
    console.log('🔍 Resolving traineddata path...');
    console.log(`📦 App packaged: ${app.isPackaged}`);
    console.log(`🖥️ Platform: ${process.platform}`);
    console.log(`📁 __dirname: ${__dirname}`);
    console.log(`📁 process.cwd(): ${process.cwd()}`);
    
    // In development: use current directory
    possiblePaths.push(__dirname);
    
    // In production: try app root directory
    if (app.isPackaged) {
      console.log(`📁 process.resourcesPath: ${process.resourcesPath}`);
      console.log(`📁 process.execPath: ${process.execPath}`);
      
      // For packaged apps, try the app's resource directory
      possiblePaths.push(process.resourcesPath);
      possiblePaths.push(path.join(process.resourcesPath, 'app'));
      possiblePaths.push(path.join(process.resourcesPath, 'app.asar.unpacked'));
      
      // Try the executable directory
      possiblePaths.push(path.dirname(process.execPath));
      
      // Try the app bundle Contents/Resources on macOS
      if (process.platform === 'darwin') {
        const appPath = path.dirname(path.dirname(process.execPath));
        possiblePaths.push(path.join(appPath, 'Resources'));
        possiblePaths.push(path.join(appPath, 'Resources', 'app'));
      }
    }
    
    // Always try the current working directory as fallback
    possiblePaths.push(process.cwd());
    
    console.log(`🔍 Testing ${possiblePaths.length} possible paths:`, possiblePaths);
    
    // Test each path to see if it exists and is writable
    for (let i = 0; i < possiblePaths.length; i++) {
      const testPath = possiblePaths[i];
      console.log(`🧪 Testing path ${i + 1}/${possiblePaths.length}: ${testPath}`);
      
      try {
        if (fs.existsSync(testPath)) {
          console.log(`✅ Path exists: ${testPath}`);
          
          // Test if we can write to this directory (needed for downloads)
          const testFile = path.join(testPath, '.write-test');
          try {
            fs.writeFileSync(testFile, 'test');
            fs.unlinkSync(testFile);
            console.log(`✅ Path is writable: ${testPath}`);
            console.log(`🎯 Selected traineddata path: ${testPath}`);
            return testPath;
          } catch (writeError) {
            console.log(`⚠️ Path exists but not writable: ${testPath} - ${writeError.message}`);
            // Continue to next path
          }
        } else {
          console.log(`❌ Path does not exist: ${testPath}`);
        }
      } catch (error) {
        console.log(`❌ Cannot access path: ${testPath} - ${error.message}`);
        // Continue to next path
      }
    }
    
    // If no writable path found, fall back to __dirname with warning
    console.warn('⚠️ No writable path found for traineddata files, using __dirname as fallback');
    console.warn('⚠️ This may cause issues in production builds');
    return __dirname;
    
  } catch (error) {
    console.error('❌ Critical error in resolveTrainedDataPath:', error);
    console.error('❌ Falling back to __dirname');
    return __dirname;
  }
}

// Function to get the full path for a traineddata file
function getTrainedDataFilePath(languageCode) {
  const basePath = resolveTrainedDataPath();
  const filePath = path.join(basePath, `${languageCode}.traineddata`);
  console.log(`🔍 Traineddata file path for ${languageCode}: ${filePath}`);
  return filePath;
}

// Function to resolve traineddata path for Tesseract.js with hybrid approach
function resolveTrainedDataForTesseract() {
  try {
    console.log('🔍 Resolving traineddata for Tesseract.js...');
    console.log(`📦 App packaged: ${app.isPackaged}`);
    
    if (app.isPackaged) {
      // In production, traineddata files are placed as extraResources directly in Resources folder
      const resourcesPath = process.resourcesPath;
      console.log(`📁 Resources path: ${resourcesPath}`);
      
      // Check if traineddata files exist in Resources directory (extraResources location)
      const testFile = path.join(resourcesPath, 'eng.traineddata');
      console.log(`🔍 Checking for traineddata file: ${testFile}`);
      
      if (fs.existsSync(testFile)) {
        console.log(`✅ Found traineddata in Resources directory: ${resourcesPath}`);
        return `file://${resourcesPath.replace(/\\/g, '/')}`;
      }
      
      // Fallback: try app.asar.unpacked path (in case of different configuration)
      const extraResourcesPath = path.join(resourcesPath, 'app.asar.unpacked');
      console.log(`🔍 Checking fallback extraResources path: ${extraResourcesPath}`);
      
      if (fs.existsSync(extraResourcesPath)) {
        const fallbackTestFile = path.join(extraResourcesPath, 'eng.traineddata');
        if (fs.existsSync(fallbackTestFile)) {
          console.log(`✅ Found traineddata in app.asar.unpacked: ${extraResourcesPath}`);
          return `file://${extraResourcesPath.replace(/\\/g, '/')}`;
        }
      }
      
      // If local files not found in production, log error and return null
      console.error('❌ Local traineddata files not found in production!');
      console.error('❌ This will cause fetch errors when Tesseract tries to download online');
      console.error('❌ Expected location:', testFile);
      return null;
    } else {
      // In development, use local files
      const devPath = resolveTrainedDataPath();
      console.log(`✅ Development mode, using local path: ${devPath}`);
      return `file://${devPath.replace(/\\/g, '/')}`;
    }
  } catch (error) {
    console.error('❌ Error resolving traineddata for Tesseract.js:', error);
    return null; // Fall back to online workers
  }
}

// Function to get proper writable temp directories for production
function getWritableTempPath() {
  try {
    console.log('🔍 Resolving writable temp path...');
    
    // Try Electron's temp directory first (recommended for Electron apps)
    if (app && app.getPath) {
      try {
        const electronTempPath = app.getPath('temp');
        console.log(`📁 Electron temp path: ${electronTempPath}`);
        
        // Create app-specific subdirectory
        const appTempPath = path.join(electronTempPath, 'ocr-screen-capture');
        if (!fs.existsSync(appTempPath)) {
          fs.mkdirSync(appTempPath, { recursive: true });
        }
        
        // Test if writable
        const testFile = path.join(appTempPath, '.write-test');
        fs.writeFileSync(testFile, 'test');
        fs.unlinkSync(testFile);
        
        console.log(`✅ Using Electron temp path: ${appTempPath}`);
        return appTempPath;
      } catch (error) {
        console.log(`⚠️ Electron temp path failed: ${error.message}`);
      }
    }
    
    // Fallback to OS temp directory
    const osTempPath = os.tmpdir();
    console.log(`📁 OS temp path: ${osTempPath}`);
    
    // Create app-specific subdirectory
    const appTempPath = path.join(osTempPath, 'ocr-screen-capture');
    if (!fs.existsSync(appTempPath)) {
      fs.mkdirSync(appTempPath, { recursive: true });
    }
    
    // Test if writable
    const testFile = path.join(appTempPath, '.write-test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    console.log(`✅ Using OS temp path: ${appTempPath}`);
    return appTempPath;
    
  } catch (error) {
    console.error('❌ Critical error in getWritableTempPath:', error);
    
    // Last resort: try user home directory
    try {
      const homeTempPath = path.join(os.homedir(), '.ocr-screen-capture-temp');
      if (!fs.existsSync(homeTempPath)) {
        fs.mkdirSync(homeTempPath, { recursive: true });
      }
      console.log(`⚠️ Using home directory fallback: ${homeTempPath}`);
      return homeTempPath;
    } catch (homeError) {
      console.error('❌ Even home directory fallback failed:', homeError);
      throw new Error('Cannot find any writable temp directory');
    }
  }
}

// Function to get writable debug directory
function getWritableDebugPath() {
  try {
    const tempPath = getWritableTempPath();
    const debugPath = path.join(tempPath, 'debug');
    
    if (!fs.existsSync(debugPath)) {
      fs.mkdirSync(debugPath, { recursive: true });
    }
    
    console.log(`🐛 Debug path: ${debugPath}`);
    return debugPath;
  } catch (error) {
    console.error('❌ Failed to create debug directory:', error);
    throw error;
  }
}

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
  { code: "khm", name: "Khmer", flag: "🇰🇭" },
  { code: "khm+eng", name: "Khmer + English", flag: "🇰🇭🇺🇸" },
];

// Function to download language data
async function downloadLanguageData(languageCode) {
  const baseUrl = "https://github.com/tesseract-ocr/tessdata/raw/main/";
  const url = `${baseUrl}${languageCode}.traineddata`;

  const filePath = getTrainedDataFilePath(languageCode);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          console.log(`✅ Downloaded ${languageCode}.traineddata successfully`);
          resolve(filePath);
        });

        file.on("error", (err) => {
          fs.unlink(filePath, () => {}); // Delete the file on error
          reject(err);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

// Function to handle language data availability and automatic download
async function handleLanguageDataAvailability(
  detectedLanguage,
  selectedLanguage
) {
  // If it's English, no need to check for data files
  if (detectedLanguage === "eng") {
    return "eng";
  }

  // Get language mapping information
  const languageInfo = getLanguageInfo(detectedLanguage);
  const { dataFileName, languageName } = languageInfo;

  const dataPath = getTrainedDataFilePath(dataFileName);

  // Check if language data file exists
  if (fs.existsSync(dataPath)) {
    console.log(`✅ ${languageName} language data found`);
    return dataFileName;
  }

  console.log(`⚠️ ${languageName} language data not found`);

  // Handle missing language data based on how the language was selected
  if (selectedLanguage === "auto") {
    // Check user preferences for auto-download
    const autoDownload = store.get("autoDownloadLanguageData");
    const fallbackToEnglish = store.get("fallbackToEnglish");

    if (autoDownload === true) {
      // User previously chose to auto-download
      console.log(
        `🚀 Auto-downloading ${languageName} language data based on user preference...`
      );

      // Send progress update to UI
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.webContents.send(
            "ocr-status",
            `Auto-downloading ${languageName} language data...`
          );
        } catch (error) {
          console.error("Failed to send download status:", error);
        }
      }

      try {
        await downloadLanguageData(dataFileName);
        console.log(`✅ ${languageName} language data downloaded successfully`);
        return dataFileName;
      } catch (downloadError) {
        console.error(`❌ Auto-download failed:`, downloadError);
        console.log("🔄 Falling back to English OCR");
        return "eng";
      }
    } else if (fallbackToEnglish === true) {
      // User previously chose to always use English
      console.log(`🔄 Using English OCR based on user preference`);
      return "eng";
    } else {
      // No preference set - prompt user
      try {
        const userChoice = await promptLanguageDataDownload(
          dataFileName,
          languageName
        );

        if (userChoice === 0) {
          // Download
          console.log(`📥 Downloading ${languageName} language data...`);

          // Send progress update to UI
          if (mainWindow && !mainWindow.isDestroyed()) {
            try {
              mainWindow.webContents.send(
                "ocr-status",
                `Downloading ${languageName} language data...`
              );
            } catch (error) {
              console.error("Failed to send download status:", error);
            }
          }

          await downloadLanguageData(dataFileName);
          console.log(
            `✅ ${languageName} language data downloaded successfully`
          );

          // Send completion update to UI
          if (mainWindow && !mainWindow.isDestroyed()) {
            try {
              mainWindow.webContents.send(
                "ocr-status",
                `Starting OCR with ${languageName}...`
              );
            } catch (error) {
              console.error("Failed to send OCR status:", error);
            }
          }

          return dataFileName;
        } else if (userChoice === 1) {
          // Use English Instead
          console.log(
            `🔄 User chose to use English instead of ${languageName}`
          );
          return "eng";
        } else {
          // Cancel
          console.log("❌ User cancelled OCR operation");
          throw new Error("OCR operation cancelled by user");
        }
      } catch (downloadError) {
        console.error(
          `❌ Failed to download ${languageName} language data:`,
          downloadError
        );
        console.log("🔄 Falling back to English OCR");
        return "eng";
      }
    }
  } else {
    // Manually selected language but data is missing - fall back to English
    console.log(
      `🔄 Falling back to English OCR (${languageName} data not available)`
    );
    return "eng";
  }
}

// Function to get language information (data file name and display name)
function getLanguageInfo(languageCode) {
  const languageMap = {
    khm: { dataFileName: "khm", languageName: "Khmer" },
    chi_sim: { dataFileName: "chi_sim", languageName: "Chinese (Simplified)" },
    spa: { dataFileName: "spa", languageName: "Spanish" },
    fra: { dataFileName: "fra", languageName: "French" },
    deu: { dataFileName: "deu", languageName: "German" },
    jpn: { dataFileName: "jpn", languageName: "Japanese" },
    kor: { dataFileName: "kor", languageName: "Korean" },
    ara: { dataFileName: "ara", languageName: "Arabic" },
    hin: { dataFileName: "hin", languageName: "Hindi" },
    rus: { dataFileName: "rus", languageName: "Russian" },
  };

  return (
    languageMap[languageCode] || {
      dataFileName: languageCode,
      languageName:
        languageCode.charAt(0).toUpperCase() + languageCode.slice(1),
    }
  );
}

// Function to prompt user for language data download
async function promptLanguageDataDownload(languageCode, languageName) {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["Download Now", "Use English Instead", "Cancel"],
    defaultId: 0,
    title: "Language Data Required",
    message: `${languageName} Language Data Detected`,
    detail: `The OCR detected ${languageName} text, but the language data file is not available locally.\n\nWould you like to download it now for better OCR accuracy?\n\n• Download size: ~10-15MB\n• One-time download\n• Improves accuracy for ${languageName} text`,
    checkboxLabel: "Remember my choice for auto-detected languages",
    checkboxChecked: false,
  });

  // Store user preference if checkbox was checked
  if (result.checkboxChecked) {
    if (result.response === 0) {
      store.set("autoDownloadLanguageData", true);
    } else if (result.response === 1) {
      store.set("autoDownloadLanguageData", false);
      store.set("fallbackToEnglish", true);
    }
  }

  return result.response;
}

async function checkScreenRecordingPermission() {
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

// Language management window
let languageManagementWindow;

function createLanguageManagementWindow() {
  languageManagementWindow = new BrowserWindow({
    width: 1000,
    height: 700,
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

  languageManagementWindow.loadFile("language-management.html");

  languageManagementWindow.on("closed", () => {
    languageManagementWindow = null;
  });

  // Register window for self-capture prevention
  if (captureManager && captureManager.selfCapturePreventionManager) {
    captureManager.selfCapturePreventionManager.registerWindow(
      languageManagementWindow,
      "language-management"
    );
  }

  console.log("🌍 Language management window created");
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
ipcMain.handle("get-config", async () => {
  // Get only installed languages for the dropdown
  const installedLanguages = await languageManager.getInstalledLanguages();
  
  return {
    language: store.get("language"),
    shortcutKey: store.get("shortcutKey"),
    permissionsGranted: store.get("permissionsGranted"),
    captureMode: store.get("captureMode"),
    autoCopy: store.get("autoCopy"),
    supportedLanguages: installedLanguages,
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

// Language Management IPC Handlers
ipcMain.handle("language-is-first-launch", async () => {
  return await languageManager.isFirstLaunch();
});

ipcMain.handle("language-get-available", async () => {
  return await languageManager.getAvailableLanguages();
});

ipcMain.handle("language-get-installed", async () => {
  return await languageManager.getInstalledLanguages();
});

ipcMain.handle("language-get-storage-info", async () => {
  return await languageManager.getStorageInfo();
});

ipcMain.handle("language-download", async (event, languageCode) => {
  try {
    // Set up progress callback
    const progressCallback = (progress) => {
      if (languageManagementWindow && !languageManagementWindow.isDestroyed()) {
        languageManagementWindow.webContents.send('language-download-progress', languageCode, progress);
      }
    };

    await languageManager.downloadLanguage(languageCode, progressCallback);
    
    // Notify completion
    if (languageManagementWindow && !languageManagementWindow.isDestroyed()) {
      languageManagementWindow.webContents.send('language-download-complete', languageCode, true);
    }
    
    return true;
  } catch (error) {
    console.error(`Failed to download language ${languageCode}:`, error);
    
    // Notify error
    if (languageManagementWindow && !languageManagementWindow.isDestroyed()) {
      languageManagementWindow.webContents.send('language-download-complete', languageCode, false);
    }
    
    throw error;
  }
});

ipcMain.handle("language-delete", async (event, languageCode) => {
  return await languageManager.deleteLanguage(languageCode);
});

ipcMain.handle("show-main-window", async () => {
  // Check if at least one language is installed
  const installedLanguages = await languageManager.getInstalledLanguages();
  if (installedLanguages.length === 0) {
    throw new Error("At least one language pack must be installed before using OCR");
  }

  // Close language management window
  if (languageManagementWindow && !languageManagementWindow.isDestroyed()) {
    languageManagementWindow.close();
  }

  // Create or show main window
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
});

ipcMain.handle("show-language-management", async () => {
  if (!languageManagementWindow || languageManagementWindow.isDestroyed()) {
    createLanguageManagementWindow();
  } else {
    languageManagementWindow.show();
    languageManagementWindow.focus();
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

    // Hide all app windows before capture to prevent self-capture
    await captureManager.selfCapturePreventionManager.hideAllAppWindows();

    try {
      // Get desktop sources
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

      // Restore app windows after successful capture
      await captureManager.selfCapturePreventionManager.restoreAppWindows();

      // Process OCR directly
      await processOCR(Array.from(imageData));
    } catch (captureError) {
      // Restore app windows even if capture fails
      await captureManager.selfCapturePreventionManager.restoreAppWindows();
      throw captureError;
    }
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

    // Get writable temp and debug directories (production-safe)
    const fs = require("fs");
    const tempDir = getWritableTempPath();
    const debugDir = getWritableDebugPath();

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

          // Map common scripts to languages (using consistent data file names)
          const scriptToLanguage = {
            Latin: "eng",
            Han: "chi_sim",
            Hiragana: "jpn",
            Katakana: "jpn",
            Hangul: "kor",
            Arabic: "ara",
            Devanagari: "hin",
            Cyrillic: "rus",
            Khmer: "khm",
            Cambodia: "khm",
            Cambodian: "khm",
          };

          finalLanguage = scriptToLanguage[detectedScript] || "khm+eng";
          console.log(
            `🎯 Mapped script "${detectedScript}" to language: ${finalLanguage}`
          );
        } else {
          console.log(
            "⚠️ Script detection failed, trying Khmer+English combination"
          );
          finalLanguage = "khm+eng";
        }
      } catch (detectionError) {
        console.warn("⚠️ Auto-detection failed:", detectionError.message);
        console.log(
          "🔄 Falling back to Khmer+English combination for better coverage"
        );
        finalLanguage = "khm+eng";
      }
    }

    // Process with Tesseract with enhanced options
    console.log("🔍 Starting Tesseract OCR with language:", finalLanguage);

    // Use only installed languages - no automatic downloads
    const installedLanguages = await languageManager.getInstalledLanguages();
    
    // Ensure installedLanguages is an array before calling map
    if (!Array.isArray(installedLanguages)) {
      console.error('❌ installedLanguages is not an array:', installedLanguages);
      throw new Error('Failed to get installed languages. Please check language manager configuration.');
    }
    
    const installedCodes = installedLanguages.map(lang => lang.code);
    
    let ocrLanguage = selectedLanguage;
    
    // If auto-detection was used, check if detected language is installed
    if (selectedLanguage === "auto") {
      if (installedCodes.includes(finalLanguage)) {
        ocrLanguage = finalLanguage;
      } else {
        // Fall back to first installed language
        ocrLanguage = installedCodes[0] || "eng";
        console.log(`⚠️ Detected language ${finalLanguage} not installed, using ${ocrLanguage}`);
      }
    } else {
      // Verify selected language is installed
      if (!installedCodes.includes(selectedLanguage)) {
        ocrLanguage = installedCodes[0] || "eng";
        console.log(`⚠️ Selected language ${selectedLanguage} not installed, using ${ocrLanguage}`);
      }
    }

    console.log("🎯 Final OCR language:", ocrLanguage);

    // Additional validation: ensure ocrLanguage is not undefined, null, or empty
    if (!ocrLanguage || typeof ocrLanguage !== 'string' || ocrLanguage.trim() === '') {
      console.error('❌ OCR language is invalid after processing:', ocrLanguage);
      console.error('❌ installedCodes:', installedCodes);
      console.error('❌ selectedLanguage:', selectedLanguage);
      console.error('❌ finalLanguage:', finalLanguage);
      throw new Error(`Invalid OCR language determined: ${ocrLanguage}. This indicates a configuration issue.`);
    }

    // Use language manager to const langsArr = langs.split('+');get the correct path for the language
    const languageDataPath = await languageManager.getLanguageDataPath(ocrLanguage);
    
    if (!languageDataPath) {
      throw new Error(`Language data not found for ${ocrLanguage}. Please download the language pack first.`);
    }

    const workerOptions = {
      langPath: languageDataPath,
      cachePath: languageDataPath, // Use same path for cache
      gzip: false, // Disable gzip to avoid additional downloads
      cacheMethod: 'none', // Disable caching mechanisms that might trigger downloads
      // Remove logger function to prevent DataCloneError - functions cannot be cloned for web workers
    };

    console.log(`🔒 Using offline language data: ${languageDataPath}`);

    // Create worker with additional offline enforcement
    console.log(`🔧 Creating Tesseract worker with options:`, workerOptions);
    
    // Validate language parameter before passing to Tesseract
    if (!ocrLanguage || typeof ocrLanguage !== 'string' || ocrLanguage.trim() === '') {
      console.error('❌ Invalid OCR language parameter:', ocrLanguage);
      throw new Error(`Invalid language parameter: ${ocrLanguage}. Expected a non-empty string.`);
    }

    console.log(`🔍 Validated OCR language parameter: "${ocrLanguage}" (type: ${typeof ocrLanguage})`);

    // CRITICAL FIX: Use Tesseract.js v6 API - createWorker now takes language as first parameter
    // In v6, loadLanguage() and initialize() methods were removed
    console.log(`🔄 Creating Tesseract worker with language: ${ocrLanguage}`);
    const worker = await Tesseract.createWorker(ocrLanguage, workerOptions);

    const {
      data: { text, confidence },
    } = await worker.recognize(tempPath);

    await worker.terminate();

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

  // Filter out app windows from desktopCapturer sources
  async filterAppWindowsFromSources(sources) {
    if (!sources || sources.length === 0) {
      return sources;
    }

    console.log(
      `🔍 Filtering ${sources.length} sources to exclude app windows`
    );

    const filteredSources = [];
    const appWindowIds = new Set();

    // Collect all app window IDs
    for (const { window } of this.appWindows) {
      if (window && !window.isDestroyed()) {
        try {
          const windowId = window.getMediaSourceId();
          if (windowId) {
            appWindowIds.add(windowId);
            console.log(
              `🛡️ Added app window ID to exclusion list: ${windowId}`
            );
          }
        } catch (error) {
          console.warn(
            "⚠️ Could not get media source ID for app window:",
            error.message
          );
        }
      }
    }

    // Add overlay window ID if it exists
    if (this.overlayWindow && !this.overlayWindow.isDestroyed()) {
      try {
        const overlayId = this.overlayWindow.getMediaSourceId();
        if (overlayId) {
          appWindowIds.add(overlayId);
          console.log(
            `🛡️ Added overlay window ID to exclusion list: ${overlayId}`
          );
        }
      } catch (error) {
        console.warn(
          "⚠️ Could not get media source ID for overlay window:",
          error.message
        );
      }
    }

    // Filter sources
    for (const source of sources) {
      if (!appWindowIds.has(source.id)) {
        filteredSources.push(source);
      } else {
        console.log(
          `🚫 Excluded app window from sources: ${source.name} (${source.id})`
        );
      }
    }

    console.log(
      `✅ Filtered sources: ${filteredSources.length}/${sources.length} sources remaining`
    );
    return filteredSources;
  }

  // Get app-safe desktop sources
  async getSafeDesktopSources(options = {}) {
    try {
      const sources = await desktopCapturer.getSources(options);
      return await this.filterAppWindowsFromSources(sources);
    } catch (error) {
      console.error("❌ Error getting safe desktop sources:", error);
      throw error;
    }
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

    // Hide all app windows before capture to prevent self-capture
    await this.selfCapturePreventionManager.hideAllAppWindows();

    try {
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
      const result = await this.processImage(thumbnailBounds, thumbnailDataUrl);

      // Restore app windows after successful capture
      await this.selfCapturePreventionManager.restoreAppWindows();

      return result;
    } catch (error) {
      // Restore app windows even if capture fails
      await this.selfCapturePreventionManager.restoreAppWindows();
      throw error;
    }
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
          debugPath: getWritableDebugPath(), // Pass writable debug path
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

// Initialize language manager
let languageManager;

app.whenReady().then(async () => {
  // Initialize language manager
  languageManager = new LanguageManager();
  await languageManager.initialize();

  // Check permissions on startup
  await checkScreenRecordingPermission();

  // Check if this is first launch (no languages installed)
  const isFirstLaunch = await languageManager.isFirstLaunch();
  
  if (isFirstLaunch) {
    // Create language management window for first launch
    createLanguageManagementWindow();
  } else {
    // Create main window normally
    createMainWindow();
  }

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
