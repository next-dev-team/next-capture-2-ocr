const { app, dialog } = require("electron");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Store = require("electron-store");

/**
 * LanguageManager - Handles all language pack operations
 * Provides offline-first language management with manual downloads
 */
class LanguageManager {
  constructor() {
    this.store = new Store({
      name: "language-manager",
      defaults: {
        installedLanguages: [],
        defaultLanguage: null,
        lastUpdated: null,
        downloadDirectory: null,
      },
    });

    this.downloadProgress = new Map();
    this.activeDownloads = new Map();

    // Available languages with metadata
    this.availableLanguages = [
      {
        code: "khm+eng",
        name: "Khmer + English",
        flag: "🇰🇭🇺🇸",
        fileSize: 6810624, // Combined estimated size of khm + eng
        downloadUrl: null, // Special handling - requires both khm and eng files
        checksum: null,
        isCombined: true,
        requiredLanguages: ["khm", "eng"],
      },
      {
        code: "eng",
        name: "English",
        flag: "🇺🇸",
        fileSize: 4963328,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata",
        checksum: null, // Will be calculated after download
      },
      {
        code: "khm",
        name: "Khmer",
        flag: "🇰🇭",
        fileSize: 1847296,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/khm.traineddata",
        checksum: null,
      },
      {
        code: "chi_sim",
        name: "Chinese (Simplified)",
        flag: "🇨🇳",
        fileSize: 17140480,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/chi_sim.traineddata",
        checksum: null,
      },
      {
        code: "jpn",
        name: "Japanese",
        flag: "🇯🇵",
        fileSize: 15411712,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/jpn.traineddata",
        checksum: null,
      },
      {
        code: "kor",
        name: "Korean",
        flag: "🇰🇷",
        fileSize: 9388032,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/kor.traineddata",
        checksum: null,
      },
      {
        code: "fra",
        name: "French",
        flag: "🇫🇷",
        fileSize: 3891200,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/fra.traineddata",
        checksum: null,
      },
      {
        code: "deu",
        name: "German",
        flag: "🇩🇪",
        fileSize: 3891200,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/deu.traineddata",
        checksum: null,
      },
      {
        code: "spa",
        name: "Spanish",
        flag: "🇪🇸",
        fileSize: 3891200,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/spa.traineddata",
        checksum: null,
      },
      {
        code: "ara",
        name: "Arabic",
        flag: "🇸🇦",
        fileSize: 2097152,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/ara.traineddata",
        checksum: null,
      },
      {
        code: "rus",
        name: "Russian",
        flag: "🇷🇺",
        fileSize: 4194304,
        downloadUrl:
          "https://github.com/tesseract-ocr/tessdata/raw/main/rus.traineddata",
        checksum: null,
      },
    ];

    this.languagesDirectory = null;
    this.manifestPath = null;
    this.initialized = false;
  }

  /**
   * Download combined language pack (e.g., khm+eng)
   */
  async downloadCombinedLanguage(
    languageCode,
    languageInfo,
    progressCallback = null
  ) {
    const downloadId = crypto.randomUUID();

    try {
      // Initialize download progress
      this.downloadProgress.set(languageCode, {
        status: "downloading",
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: languageInfo.fileSize,
        startTime: Date.now(),
        errorMessage: null,
        currentStep: `Preparing download...`,
      });

      this.activeDownloads.set(languageCode, downloadId);

      console.log(
        `📥 Starting download for combined language ${languageInfo.name} (${languageCode})`
      );

      const installedLanguages = this.store.get("installedLanguages", []);
      const requiredLanguages = languageInfo.requiredLanguages;
      const totalLanguages = requiredLanguages.length;
      let completedLanguages = 0;

      // Update initial progress
      const updateProgress = (step, progress = 0, currentLang = null) => {
        const overallProgress = (completedLanguages + progress) / totalLanguages;
        const stepText = currentLang ? 
          `Downloading ${currentLang} (${Math.round(progress * 100)}%)` : 
          step;
        
        this.downloadProgress.set(languageCode, {
          ...this.downloadProgress.get(languageCode),
          progress: overallProgress,
          bytesDownloaded: Math.floor(languageInfo.fileSize * overallProgress),
          totalBytes: languageInfo.fileSize,
          currentStep: stepText,
        });

        if (progressCallback) {
          progressCallback({
            progress: overallProgress,
            bytesDownloaded: Math.floor(languageInfo.fileSize * overallProgress),
            totalBytes: languageInfo.fileSize,
            currentStep: stepText,
          });
        }
      };

      // Download each required language if not already installed
      for (let i = 0; i < requiredLanguages.length; i++) {
        const reqLangCode = requiredLanguages[i];
        const langInfo = this.availableLanguages.find(lang => lang.code === reqLangCode);
        const langName = langInfo ? langInfo.name : reqLangCode;

        if (!installedLanguages.includes(reqLangCode)) {
          console.log(`📥 Downloading required language: ${reqLangCode}`);
          updateProgress(`Starting download of ${langName}...`, 0, langName);

          // Download the individual language with proper progress tracking
          await this.downloadLanguage(reqLangCode, (progress) => {
            updateProgress(`Downloading ${langName}...`, progress.progress, langName);
          });

          // Validate the downloaded language
          const langFilePath = path.join(this.languagesDirectory, `${reqLangCode}.traineddata`);
          if (!fs.existsSync(langFilePath)) {
            throw new Error(`Failed to download ${langName} - file not found after download`);
          }

          // Validate file integrity if checksum is available
          if (langInfo && langInfo.checksum) {
            updateProgress(`Validating ${langName}...`, 1, langName);
            const isValid = await this.validateLanguageFile(langFilePath, langInfo);
            if (!isValid) {
              throw new Error(`Downloaded ${langName} file failed validation`);
            }
          }

          console.log(`✅ Successfully downloaded and validated ${langName}`);
        } else {
          console.log(`✅ Required language ${reqLangCode} already installed`);
          
          // Still validate existing file
          const langFilePath = path.join(this.languagesDirectory, `${reqLangCode}.traineddata`);
          if (!fs.existsSync(langFilePath)) {
            console.warn(`⚠️ Language ${reqLangCode} marked as installed but file missing, re-downloading...`);
            // Remove from installed list and re-download
            const currentInstalled = this.store.get("installedLanguages", []);
            const filteredInstalled = currentInstalled.filter(lang => lang !== reqLangCode);
            this.store.set("installedLanguages", filteredInstalled);
            
            // Re-download
            await this.downloadLanguage(reqLangCode, (progress) => {
              updateProgress(`Re-downloading ${langName}...`, progress.progress, langName);
            });
          }
        }

        completedLanguages++;
        updateProgress(`Completed ${langName}`, 1);
      }

      // Final validation - ensure all required languages are properly installed
      updateProgress("Finalizing combined language...");
      const finalInstalledLanguages = this.store.get("installedLanguages", []);
      const allRequiredInstalled = requiredLanguages.every(reqLang => {
        const isInstalled = finalInstalledLanguages.includes(reqLang);
        const filePath = path.join(this.languagesDirectory, `${reqLang}.traineddata`);
        const fileExists = fs.existsSync(filePath);
        
        if (!isInstalled || !fileExists) {
          console.error(`❌ Required language ${reqLang} not properly installed: installed=${isInstalled}, fileExists=${fileExists}`);
          return false;
        }
        return true;
      });

      if (!allRequiredInstalled) {
        throw new Error(`Not all required languages are properly installed for ${languageCode}`);
      }

      // Mark combined language as installed only after all validations pass
      if (!finalInstalledLanguages.includes(languageCode)) {
        finalInstalledLanguages.push(languageCode);
        this.store.set("installedLanguages", finalInstalledLanguages);
      }

      // Update progress to completed
      this.downloadProgress.set(languageCode, {
        ...this.downloadProgress.get(languageCode),
        status: "completed",
        progress: 1,
        currentStep: "Download completed successfully!",
      });

      console.log(
        `✅ Successfully downloaded combined language ${languageInfo.name} (${languageCode})`
      );

      // Set as default if it's the first language
      if (!this.store.get("defaultLanguage")) {
        this.store.set("defaultLanguage", languageCode);
      }

      return downloadId;
    } catch (error) {
      // Update progress to error state
      this.downloadProgress.set(languageCode, {
        ...this.downloadProgress.get(languageCode),
        status: "error",
        errorMessage: error.message,
        currentStep: `Error: ${error.message}`,
      });

      console.error(
        `❌ Failed to download combined language ${languageCode}:`,
        error
      );
      throw error;
    } finally {
      this.activeDownloads.delete(languageCode);
    }
  }

  /**
   * Initialize the language manager
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Set up directories
      const userDataPath = app.getPath("userData");
      this.languagesDirectory = path.join(userDataPath, "languages");
      this.manifestPath = path.join(this.languagesDirectory, "manifest.json");

      // Create directories if they don't exist
      if (!fs.existsSync(this.languagesDirectory)) {
        fs.mkdirSync(this.languagesDirectory, { recursive: true });
        console.log("📁 Created languages directory:", this.languagesDirectory);
      }

      // Update store with directory path
      this.store.set("downloadDirectory", this.languagesDirectory);

      // Load existing manifest or create new one
      await this.loadManifest();

      // Scan for existing language files and update manifest
      await this.scanExistingLanguages();

      this.initialized = true;
      console.log("✅ LanguageManager initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize LanguageManager:", error);
      throw error;
    }
  }

  /**
   * Load language manifest from disk
   */
  async loadManifest() {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const manifestData = fs.readFileSync(this.manifestPath, "utf8");
        const manifest = JSON.parse(manifestData);

        // Update store with manifest data
        if (manifest.languages) {
          const installedLanguages = Object.keys(manifest.languages);
          this.store.set("installedLanguages", installedLanguages);
          this.store.set("lastUpdated", manifest.lastUpdated);
        }

        console.log(
          "📄 Loaded language manifest:",
          Object.keys(manifest.languages || {})
        );
      } else {
        // Create empty manifest
        await this.saveManifest({});
        console.log("📄 Created new language manifest");
      }
    } catch (error) {
      console.error("❌ Failed to load manifest:", error);
      // Create empty manifest on error
      await this.saveManifest({});
    }
  }

  /**
   * Save language manifest to disk
   */
  async saveManifest(languageData) {
    try {
      const manifest = {
        version: "1.0.0",
        languages: languageData,
        lastUpdated: new Date().toISOString(),
      };

      fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2));
      this.store.set("lastUpdated", manifest.lastUpdated);

      console.log("💾 Saved language manifest");
    } catch (error) {
      console.error("❌ Failed to save manifest:", error);
      throw error;
    }
  }

  /**
   * Scan for existing language files and update manifest
   */
  async scanExistingLanguages() {
    try {
      const manifestData = {};
      const installedLanguages = [];

      // Scan languages directory
      const existingFiles = fs
        .readdirSync(this.languagesDirectory)
        .filter((file) => file.endsWith(".traineddata"));

      for (const file of existingFiles) {
        const languageCode = file.replace(".traineddata", "");
        const languageInfo = this.availableLanguages.find(
          (lang) => lang.code === languageCode
        );

        if (languageInfo) {
          const filePath = path.join(this.languagesDirectory, file);
          const stats = fs.statSync(filePath);

          manifestData[languageCode] = {
            name: languageInfo.name,
            flag: languageInfo.flag,
            fileSize: stats.size,
            installedAt: stats.birthtime.toISOString(),
            checksum: await this.calculateChecksum(filePath),
            version: "4.1.0",
          };

          installedLanguages.push(languageCode);
        }
      }

      // Also scan project root for combined language files (development mode)
      const projectRootFiles = [];
      try {
        const rootFiles = fs.readdirSync(process.cwd())
          .filter((file) => file.endsWith(".traineddata"));
        projectRootFiles.push(...rootFiles);
      } catch (error) {
        // Ignore if can't read project root
      }

      for (const file of projectRootFiles) {
        const languageCode = file.replace(".traineddata", "");
        const languageInfo = this.availableLanguages.find(
          (lang) => lang.code === languageCode
        );

        // Only add if it's a combined language and not already found
        if (languageInfo && languageInfo.isCombined && !installedLanguages.includes(languageCode)) {
          const filePath = path.join(process.cwd(), file);
          const stats = fs.statSync(filePath);

          manifestData[languageCode] = {
            name: languageInfo.name,
            flag: languageInfo.flag,
            fileSize: stats.size,
            installedAt: stats.birthtime.toISOString(),
            checksum: await this.calculateChecksum(filePath),
            version: "4.1.0",
          };

          installedLanguages.push(languageCode);
          console.log(`✅ Found combined language in project root: ${languageCode}`);
        }
      }

      // Check for combined languages that can be formed from existing individual languages
      for (const lang of this.availableLanguages) {
        if (lang.isCombined && lang.requiredLanguages && !installedLanguages.includes(lang.code)) {
          const allRequiredInstalled = lang.requiredLanguages.every(reqLang => 
            installedLanguages.includes(reqLang)
          );
          
          if (allRequiredInstalled) {
            // Mark combined language as available since all components are installed
            manifestData[lang.code] = {
              name: lang.name,
              flag: lang.flag,
              fileSize: lang.fileSize,
              installedAt: new Date().toISOString(),
              checksum: null, // Combined languages don't have their own checksum
              version: "4.1.0",
              isCombined: true,
              requiredLanguages: lang.requiredLanguages
            };
            
            installedLanguages.push(lang.code);
            console.log(`✅ Combined language ${lang.code} available (components installed)`);
          }
        }
      }

      await this.saveManifest(manifestData);
      this.store.set("installedLanguages", installedLanguages);

      // Set default language if none set and we have installed languages
      if (installedLanguages.length > 0 && !this.store.get("defaultLanguage")) {
        const defaultLang = installedLanguages.includes("eng")
          ? "eng"
          : installedLanguages[0];
        this.store.set("defaultLanguage", defaultLang);
      }

      console.log("🔍 Scanned existing languages:", installedLanguages);
    } catch (error) {
      console.error("❌ Failed to scan existing languages:", error);
    }
  }

  /**
   * Get list of available languages with installation status
   */
  getAvailableLanguages() {
    try {
      const installedLanguages = this.store.get("installedLanguages", []);

      // Ensure installedLanguages is an array
      const safeInstalledLanguages = Array.isArray(installedLanguages)
        ? installedLanguages
        : [];

      const result = this.availableLanguages.map((lang) => ({
        ...lang,
        isInstalled: safeInstalledLanguages.includes(lang.code),
        downloadProgress: this.downloadProgress.get(lang.code) || null,
      }));

      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error("❌ Error in getAvailableLanguages:", error);
      return [];
    }
  }

  /**
   * Get list of installed languages only
   */
  getInstalledLanguages() {
    try {
      const installedLanguages = this.store.get("installedLanguages", []);

      // Ensure installedLanguages is an array
      if (!Array.isArray(installedLanguages)) {
        console.warn(
          "⚠️ installedLanguages is not an array, returning empty array"
        );
        return [];
      }

      const result = this.availableLanguages
        .filter((lang) => installedLanguages.includes(lang.code))
        .map((lang) => ({
          code: lang.code,
          name: lang.name,
          flag: lang.flag,
        }));

      // Ensure we always return an array
      return Array.isArray(result) ? result : [];
    } catch (error) {
      console.error("❌ Error in getInstalledLanguages:", error);
      return [];
    }
  }

  /**
   * Check if any languages are installed
   */
  hasInstalledLanguages() {
    const installedLanguages = this.store.get("installedLanguages", []);
    return installedLanguages.length > 0;
  }

  /**
   * Check if this is the first launch (no languages installed)
   */
  isFirstLaunch() {
    return !this.hasInstalledLanguages();
  }

  /**
   * Download a language pack
   */
  async downloadLanguage(languageCode, progressCallback = null) {
    if (!this.initialized) {
      throw new Error("LanguageManager not initialized");
    }

    const languageInfo = this.availableLanguages.find(
      (lang) => lang.code === languageCode
    );
    if (!languageInfo) {
      throw new Error(`Language ${languageCode} not available`);
    }

    // Check if already installed
    const installedLanguages = this.store.get("installedLanguages", []);
    if (installedLanguages.includes(languageCode)) {
      throw new Error(`Language ${languageCode} is already installed`);
    }

    // Check if download is already in progress
    if (this.activeDownloads.has(languageCode)) {
      throw new Error(`Download for ${languageCode} is already in progress`);
    }

    // Handle combined languages (e.g., khm+eng)
    if (languageInfo.isCombined && languageInfo.requiredLanguages) {
      return await this.downloadCombinedLanguage(
        languageCode,
        languageInfo,
        progressCallback
      );
    }

    const downloadId = crypto.randomUUID();
    const filePath = path.join(
      this.languagesDirectory,
      `${languageCode}.traineddata`
    );

    try {
      // Initialize download progress
      this.downloadProgress.set(languageCode, {
        status: "downloading",
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: languageInfo.fileSize,
        startTime: Date.now(),
        errorMessage: null,
      });

      this.activeDownloads.set(languageCode, downloadId);

      console.log(
        `📥 Starting download for ${languageInfo.name} (${languageCode})`
      );

      // Download the file
      await this.downloadFile(
        languageInfo.downloadUrl,
        filePath,
        (progress) => {
          this.downloadProgress.set(languageCode, {
            ...this.downloadProgress.get(languageCode),
            progress: progress.progress,
            bytesDownloaded: progress.bytesDownloaded,
            totalBytes: progress.totalBytes,
          });

          if (progressCallback) {
            progressCallback(progress);
          }
        }
      );

      // Validate downloaded file
      const isValid = await this.validateLanguageFile(filePath, languageInfo);
      if (!isValid) {
        fs.unlinkSync(filePath);
        throw new Error("Downloaded file validation failed");
      }

      // Update manifest and store
      await this.addLanguageToManifest(languageCode, languageInfo, filePath);

      // Update progress to completed
      this.downloadProgress.set(languageCode, {
        ...this.downloadProgress.get(languageCode),
        status: "completed",
        progress: 1,
      });

      console.log(
        `✅ Successfully downloaded ${languageInfo.name} (${languageCode})`
      );

      // Set as default if it's the first language
      if (!this.store.get("defaultLanguage")) {
        this.store.set("defaultLanguage", languageCode);
      }

      return downloadId;
    } catch (error) {
      // Update progress to error state
      this.downloadProgress.set(languageCode, {
        ...this.downloadProgress.get(languageCode),
        status: "error",
        errorMessage: error.message,
      });

      console.error(`❌ Failed to download ${languageCode}:`, error);
      throw error;
    } finally {
      this.activeDownloads.delete(languageCode);
    }
  }

  /**
   * Delete a language pack
   */
  async deleteLanguage(languageCode) {
    if (!this.initialized) {
      throw new Error("LanguageManager not initialized");
    }

    const installedLanguages = this.store.get("installedLanguages", []);
    if (!installedLanguages.includes(languageCode)) {
      throw new Error(`Language ${languageCode} is not installed`);
    }

    // Prevent deletion if it's the only language
    if (installedLanguages.length === 1) {
      throw new Error(
        "Cannot delete the only installed language. At least one language must remain."
      );
    }

    try {
      const filePath = path.join(
        this.languagesDirectory,
        `${languageCode}.traineddata`
      );

      // Delete the file
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Update manifest and store
      await this.removeLanguageFromManifest(languageCode);

      // Update default language if necessary
      const defaultLanguage = this.store.get("defaultLanguage");
      if (defaultLanguage === languageCode) {
        const remainingLanguages = this.store.get("installedLanguages", []);
        const newDefault = remainingLanguages.includes("eng")
          ? "eng"
          : remainingLanguages[0];
        this.store.set("defaultLanguage", newDefault);
      }

      console.log(`🗑️ Successfully deleted language ${languageCode}`);
    } catch (error) {
      console.error(`❌ Failed to delete language ${languageCode}:`, error);
      throw error;
    }
  }

  /**
   * Get the path to language files directory
   */
  getLanguagesPath() {
    return this.languagesDirectory;
  }

  /**
   * Get the path to a specific language data file
   */
  async getLanguageDataPath(languageCode) {
    if (!this.initialized) {
      throw new Error("LanguageManager not initialized");
    }

    // Check if it's a combined language (e.g., khm+eng)
    const languageInfo = this.availableLanguages.find(lang => lang.code === languageCode);
    if (languageInfo && languageInfo.isCombined) {
      // For combined languages, check if all required languages are installed and files exist
      const installedLanguages = this.store.get("installedLanguages", []);
      
      // First check if the combined language is marked as installed
      if (!installedLanguages.includes(languageCode)) {
        console.warn(`⚠️ Combined language ${languageCode} not marked as installed`);
        return null;
      }
      
      // Verify all required individual languages are properly installed
      const missingLanguages = [];
      for (const reqLang of languageInfo.requiredLanguages) {
        const isInstalled = installedLanguages.includes(reqLang);
        const filePath = path.join(this.languagesDirectory, `${reqLang}.traineddata`);
        const fileExists = fs.existsSync(filePath);
        
        if (!isInstalled || !fileExists) {
          missingLanguages.push({
            code: reqLang,
            installed: isInstalled,
            fileExists: fileExists
          });
        }
      }
      
      if (missingLanguages.length > 0) {
        console.error(`❌ Combined language ${languageCode} missing required components:`, missingLanguages);
        
        // Remove combined language from installed list since it's not properly set up
        const updatedInstalled = installedLanguages.filter(lang => lang !== languageCode);
        this.store.set("installedLanguages", updatedInstalled);
        
        throw new Error(`Language data not found for ${languageCode}. Please download the language pack first.`);
      }
      
      // All required languages are properly installed, return the directory
      console.log(`✅ Combined language ${languageCode} verified - all required components available`);
      return this.languagesDirectory;
    }

    // For regular languages, check if installed
    const installedLanguages = this.store.get("installedLanguages", []);
    if (!installedLanguages.includes(languageCode)) {
      console.warn(`⚠️ Language ${languageCode} not marked as installed`);
      return null;
    }

    const filePath = path.join(
      this.languagesDirectory,
      `${languageCode}.traineddata`
    );

    // Verify file exists
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Language file not found: ${filePath}`);
      
      // Remove from installed list since file is missing
      const updatedInstalled = installedLanguages.filter(lang => lang !== languageCode);
      this.store.set("installedLanguages", updatedInstalled);
      
      return null;
    }

    return this.languagesDirectory; // Return directory path for Tesseract
  }

  /**
   * Get default language
   */
  getDefaultLanguage() {
    return this.store.get("defaultLanguage");
  }

  /**
   * Set default language
   */
  setDefaultLanguage(languageCode) {
    const installedLanguages = this.store.get("installedLanguages", []);
    if (!installedLanguages.includes(languageCode)) {
      throw new Error(`Language ${languageCode} is not installed`);
    }

    this.store.set("defaultLanguage", languageCode);
  }

  /**
   * Get storage usage information
   */
  getStorageInfo() {
    try {
      let totalSize = 0;
      const languageFiles = {};

      const installedLanguages = this.store.get("installedLanguages", []);

      for (const languageCode of installedLanguages) {
        const filePath = path.join(
          this.languagesDirectory,
          `${languageCode}.traineddata`
        );
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          const size = stats.size;
          totalSize += size;

          const languageInfo = this.availableLanguages.find(
            (lang) => lang.code === languageCode
          );
          languageFiles[languageCode] = {
            name: languageInfo ? languageInfo.name : languageCode,
            size: size,
            formattedSize: this.formatFileSize(size),
          };
        }
      }

      return {
        totalSize,
        formattedTotalSize: this.formatFileSize(totalSize),
        languageFiles,
        directory: this.languagesDirectory,
      };
    } catch (error) {
      console.error("❌ Failed to get storage info:", error);
      return {
        totalSize: 0,
        formattedTotalSize: "0 B",
        languageFiles: {},
        directory: this.languagesDirectory,
      };
    }
  }

  // Private helper methods

  /**
   * Download a file with progress tracking
   */
  downloadFile(url, filePath, progressCallback) {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(filePath);
      let downloadedBytes = 0;

      const request = https.get(url, (response) => {
        // Handle redirects (301, 302, 307, 308)
        if (
          response.statusCode >= 300 &&
          response.statusCode < 400 &&
          response.headers.location
        ) {
          file.close();
          fs.unlink(filePath, () => {}); // Delete empty file
          // Follow redirect
          this.downloadFile(
            response.headers.location,
            filePath,
            progressCallback
          )
            .then(resolve)
            .catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlink(filePath, () => {}); // Delete partial file
          reject(
            new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`)
          );
          return;
        }

        const totalBytes = parseInt(response.headers["content-length"], 10);

        response.on("data", (chunk) => {
          downloadedBytes += chunk.length;

          if (progressCallback) {
            progressCallback({
              progress: totalBytes ? downloadedBytes / totalBytes : 0,
              bytesDownloaded: downloadedBytes,
              totalBytes: totalBytes || 0,
            });
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });

        file.on("error", (error) => {
          fs.unlink(filePath, () => {}); // Delete partial file
          reject(error);
        });
      });

      request.on("error", (error) => {
        fs.unlink(filePath, () => {}); // Delete partial file
        reject(error);
      });

      request.setTimeout(30000, () => {
        request.destroy();
        fs.unlink(filePath, () => {}); // Delete partial file
        reject(new Error("Download timeout"));
      });
    });
  }

  /**
   * Validate a combined language installation
   */
  async validateCombinedLanguage(languageCode) {
    try {
      const languageInfo = this.availableLanguages.find(lang => lang.code === languageCode);
      if (!languageInfo || !languageInfo.isCombined) {
        return false;
      }

      const installedLanguages = this.store.get("installedLanguages", []);
      
      // Check if combined language is marked as installed
      if (!installedLanguages.includes(languageCode)) {
        console.warn(`⚠️ Combined language ${languageCode} not marked as installed`);
        return false;
      }

      // Validate all required individual languages
      for (const reqLang of languageInfo.requiredLanguages) {
        // Check if marked as installed
        if (!installedLanguages.includes(reqLang)) {
          console.warn(`⚠️ Required language ${reqLang} not marked as installed for ${languageCode}`);
          return false;
        }

        // Check if file exists
        const filePath = path.join(this.languagesDirectory, `${reqLang}.traineddata`);
        if (!fs.existsSync(filePath)) {
          console.warn(`⚠️ Required language file missing: ${filePath}`);
          return false;
        }

        // Validate file integrity if possible
        const reqLangInfo = this.availableLanguages.find(lang => lang.code === reqLang);
        if (reqLangInfo && !(await this.validateLanguageFile(filePath, reqLangInfo))) {
          console.warn(`⚠️ Required language file corrupted: ${filePath}`);
          return false;
        }
      }

      console.log(`✅ Combined language ${languageCode} validation passed`);
      return true;
    } catch (error) {
      console.error(`❌ Error validating combined language ${languageCode}:`, error);
      return false;
    }
  }

  /**
   * Validate downloaded language file
   */
  async validateLanguageFile(filePath, languageInfo) {
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }

      // Check file size first (quick check)
      const stats = fs.statSync(filePath);
      if (languageInfo.size && stats.size !== languageInfo.size) {
        console.warn(
          `⚠️ File size mismatch for ${filePath}: expected ${languageInfo.size}, got ${stats.size}`
        );
        return false;
      }

      // If checksum is available, validate it
      if (languageInfo.checksum) {
        const actualChecksum = await this.calculateChecksum(filePath);
        if (actualChecksum !== languageInfo.checksum) {
          console.warn(
            `⚠️ Checksum mismatch for ${filePath}: expected ${languageInfo.checksum}, got ${actualChecksum}`
          );
          return false;
        }
      }

      // Basic validation: check if file exists and has reasonable size
      const actualSize = stats.size;
      const minSize = 1024 * 1024; // 1MB minimum

      if (actualSize < minSize) {
        console.warn(
          `⚠️ File too small: ${actualSize} bytes (minimum: ${minSize} bytes)`
        );
        return false;
      }

      // Check if file is readable
      fs.accessSync(filePath, fs.constants.R_OK);

      console.log(
        `✅ File validation passed: ${this.formatFileSize(actualSize)}`
      );
      return true;
    } catch (error) {
      console.error("❌ File validation failed:", error);
      return false;
    }
  }

  /**
   * Calculate file checksum
   */
  async calculateChecksum(filePath) {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);

      stream.on("data", (data) => hash.update(data));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", reject);
    });
  }

  /**
   * Add language to manifest
   */
  async addLanguageToManifest(languageCode, languageInfo, filePath) {
    try {
      // Load current manifest
      let manifestData = {};
      if (fs.existsSync(this.manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
        manifestData = manifest.languages || {};
      }

      // Add new language
      const stats = fs.statSync(filePath);
      manifestData[languageCode] = {
        name: languageInfo.name,
        flag: languageInfo.flag,
        fileSize: stats.size,
        installedAt: new Date().toISOString(),
        checksum: await this.calculateChecksum(filePath),
        version: "4.1.0",
      };

      // Save manifest
      await this.saveManifest(manifestData);

      // Update store
      const installedLanguages = this.store.get("installedLanguages", []);
      if (!installedLanguages.includes(languageCode)) {
        installedLanguages.push(languageCode);
        this.store.set("installedLanguages", installedLanguages);
      }
    } catch (error) {
      console.error("❌ Failed to add language to manifest:", error);
      throw error;
    }
  }

  /**
   * Remove language from manifest
   */
  async removeLanguageFromManifest(languageCode) {
    try {
      // Load current manifest
      let manifestData = {};
      if (fs.existsSync(this.manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(this.manifestPath, "utf8"));
        manifestData = manifest.languages || {};
      }

      // Remove language
      delete manifestData[languageCode];

      // Save manifest
      await this.saveManifest(manifestData);

      // Update store
      const installedLanguages = this.store.get("installedLanguages", []);
      const updatedLanguages = installedLanguages.filter(
        (lang) => lang !== languageCode
      );
      this.store.set("installedLanguages", updatedLanguages);
    } catch (error) {
      console.error("❌ Failed to remove language from manifest:", error);
      throw error;
    }
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }
}

module.exports = LanguageManager;
