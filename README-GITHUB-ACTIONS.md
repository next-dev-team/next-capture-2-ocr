# GitHub Actions Release Workflow

This repository includes an automated GitHub Actions workflow that builds and releases your OCR Screen Capture application for macOS and Windows platforms.

## How It Works

The workflow automatically triggers when:
- Code is pushed to the `main` branch
- A pull request is merged into the `main` branch

## What It Does

1. **Builds for Multiple Platforms**: Creates builds for both macOS and Windows (Linux is intentionally skipped)
2. **Creates Releases**: Automatically creates GitHub releases with version tags
3. **Uploads Artifacts**: Attaches the built applications to the GitHub release
4. **Unsigned Builds**: Builds applications without code signing for simplicity

## Build Outputs

- **macOS**: 
  - `.dmg` installer file
  - `.zip` archive
- **Windows**: 
  - `.exe` NSIS installer

## No Setup Required

The workflow is configured to build unsigned applications, so no additional setup or secrets are required. Just push your code to the main branch and the workflow will handle the rest!

## Workflow Features

- ✅ Automatic version detection from `package.json`
- ✅ Git tagging with semantic versioning (`v1.0.0` format)
- ✅ Cross-platform builds using GitHub's hosted runners
- ✅ Dependency caching for faster builds
- ✅ Build artifact retention (30 days)
- ✅ Unsigned builds (no code signing required)

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