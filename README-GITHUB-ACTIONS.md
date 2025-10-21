# GitHub Actions Release Workflow

This document explains the automated release workflow for the OCR Screen Capture application.

## Workflow Overview

The GitHub Actions workflow automatically builds and releases the application for Mac and Windows platforms when:
- Code is pushed to the `main` branch
- A pull request is merged into the `main` branch

## Required GitHub Secrets

To enable the workflow, you need to configure the following secrets in your GitHub repository settings:

### Required Secrets
- `GITHUB_TOKEN` - Automatically provided by GitHub (no setup needed)

### Optional Code Signing Secrets (Recommended for Production)

#### macOS Code Signing
- `APPLE_ID` - Your Apple ID email for notarization
- `APPLE_ID_PASSWORD` - App-specific password for your Apple ID
- `APPLE_TEAM_ID` - Your Apple Developer Team ID
- `CSC_LINK` - Base64 encoded .p12 certificate file
- `CSC_KEY_PASSWORD` - Password for the .p12 certificate

#### Windows Code Signing
- `CSC_LINK_WIN` - Base64 encoded .p12 certificate file for Windows
- `CSC_KEY_PASSWORD_WIN` - Password for the Windows certificate

## How to Set Up Secrets

1. Go to your GitHub repository
2. Click on **Settings** tab
3. Navigate to **Secrets and variables** → **Actions**
4. Click **New repository secret**
5. Add each secret with the exact name listed above

## Workflow Features

- ✅ Builds for macOS (DMG and ZIP)
- ✅ Builds for Windows (EXE installer)
- ✅ Automatic version tagging based on package.json
- ✅ Creates GitHub releases with build artifacts
- ✅ Supports code signing (when certificates are provided)
- ✅ Caches dependencies for faster builds
- ✅ Uploads build artifacts for 30 days retention

## Build Outputs

### macOS
- `OCR-Screen-Capture-{version}-mac.dmg` - Disk image for installation
- `OCR-Screen-Capture-{version}-mac.zip` - Zipped application bundle

### Windows
- `OCR-Screen-Capture-Setup-{version}-win.exe` - NSIS installer

## Troubleshooting

### Build Fails on Windows
- Ensure Visual Studio Build Tools are properly installed (handled automatically)
- Check that all native dependencies are compatible with Windows

### Build Fails on macOS
- Verify that entitlements.mac.plist exists and is properly configured
- Check code signing certificates if using signed builds

### Release Not Created
- Ensure the version in package.json has been incremented
- Check that the workflow has proper permissions to create releases
- Verify GITHUB_TOKEN has the necessary scopes

## Manual Release

If you need to trigger a release manually:
1. Update the version in `package.json`
2. Commit and push to the `main` branch
3. The workflow will automatically detect the new version and create a release

## Workflow File Location

The workflow is defined in: `.github/workflows/release.yml`

## Notes

- Linux builds are intentionally skipped as requested
- The workflow uses the latest stable versions of macOS and Windows runners
- Build artifacts are retained for 30 days for debugging purposes
- Code signing is optional but recommended for production releases