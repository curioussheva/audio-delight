#!/usr/bin/env python3
"""
Pristine Audio - Import Fixer Script
Mengubah semua path alias lama ke struktur baru features/ dan shared/
"""

import re
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path.cwd()
SRC_DIR = PROJECT_ROOT / "src"

# Mapping: path lama -> path baru
IMPORT_MAPPINGS = {
    # Hooks -> features/
    "@/hooks/useLibrary": "@/features/library/hooks/useLibrary",
    "@/hooks/useOptimizedLibrary": "@/features/library/hooks/useOptimizedLibrary",
    "@/hooks/useAudioPlayer": "@/features/player/hooks/useAudioPlayer",
    "@/hooks/useAudioProgress": "@/features/player/hooks/useAudioProgress",
    "@/hooks/useTrackPlayerHandler": "@/features/player/hooks/useTrackPlayerHandler",
    "@/hooks/useEqualizer": "@/features/equalizer/hooks/useEqualizer",
    "@/hooks/useFavorites": "@/features/favorites/hooks/useFavorites",
    "@/hooks/usePlaylists": "@/features/playlist/hooks/usePlaylists",
    "@/hooks/useUSBDAC": "@/features/hardware/hooks/useUSBDAC",
    "@/hooks/useAudioAnalyzer": "@/features/visualizer/hooks/useAudioAnalyzer",
    "@/hooks/useAudioPermissions": "@/shared/hooks/useAudioPermissions",
    "@/hooks/useSearch": "@/shared/hooks/useSearch",
    
    # Stores -> features/
    "@/store/playerStore": "@/features/player/store/playerStore",
    "@/store/equalizerStore": "@/features/equalizer/store/equalizerStore",
    
    # Components -> features/ atau shared/
    "@/components/navigation/CustomDrawer": "@/shared/components/navigation/CustomDrawer",
    "@/components/ui/QualityBadge": "@/shared/components/ui/QualityBadge",
    "@/components/ui/ThemePicker": "@/shared/components/ui/ThemePicker",
    "@/components/ui/LoadingScreen": "@/shared/components/ui/LoadingScreen",
    "@/components/ui/EmptyState": "@/shared/components/ui/EmptyState",
    "@/components/ui/EnhancedProgressBar": "@/shared/components/ui/EnhancedProgressBar",
    "@/components/ui/DynamicBackground": "@/shared/components/ui/DynamicBackground",
    
    # Audio components -> player/
    "@/components/audio/AlbumArt": "@/features/player/components/AlbumArt",
    "@/components/audio/AudioPropertyToast": "@/features/player/components/AudioPropertyToast",
    "@/components/audio/FloatingPlayer": "@/features/player/components/FloatingPlayer",
    "@/components/audio/FullLyricsView": "@/features/player/components/FullLyricsView",
    "@/components/audio/LyricPreview": "@/features/player/components/LyricPreview",
    "@/components/audio/OutputSettings": "@/features/player/components/OutputSettings",
    "@/components/audio/PlaybackSpeed": "@/features/player/components/PlaybackSpeed",
    "@/components/audio/PlayerControls": "@/features/player/components/Controls",
    "@/components/audio/QueueManager": "@/features/player/components/QueueManager",
    "@/components/audio/SleepTimerModal": "@/features/player/components/SleepTimerModal",
    "@/components/audio/SongMetadata": "@/features/player/components/SongMetadata",
    
    # Equalizer components
    "@/components/equalizer/EqualizerBand": "@/features/equalizer/components/Band",
    "@/components/equalizer/FrequencyGraph": "@/features/equalizer/components/Graph",
    "@/components/equalizer/PresetChip": "@/features/equalizer/components/PresetChip",
    "@/components/equalizer/SavePresetModal": "@/features/equalizer/components/SavePresetModal",
    
    # Library components
    "@/components/library/EmptyLibrary": "@/features/library/components/EmptyLibrary",
    "@/components/library/SongListItem": "@/features/library/components/SongListItem",
    "@/components/library/FilterModal": "@/features/library/components/FilterModal",
    "@/components/library/FileFilterBar": "@/features/library/components/FileFilterBar",
    
    # Visualizer components
    "@/components/visualizer/SpectrumAnalyzer": "@/features/visualizer/components/SpectrumAnalyzer",
    "@/components/visualizer/SpectogramView": "@/features/visualizer/components/SpectogramView",
    
    # Services -> features/
    "@/services/library/LibraryScanner": "@/features/library/api/scanner",
    "@/services/library/MetadataExtractor": "@/features/library/api/metadata",
    "@/services/library/M3UParser": "@/features/library/api/m3u",
    "@/services/audio/playbackService": "@/features/player/api/playback",
    "@/services/audio/AudioEngine": "@/features/player/api/engine",
    "@/services/audio/EqualizerService": "@/features/equalizer/api/service",
    "@/services/audio/PresetStorage": "@/features/equalizer/api/presets",
    "@/services/audio/AudioAnalyzerService": "@/features/visualizer/api/analyzer",
    "@/services/audio/FFTAnalyzer": "@/features/visualizer/api/fft",
    "@/services/audio/VisualizerService": "@/features/visualizer/api/visualizer",
    "@/services/audio/DSPPipeline": "@/features/visualizer/api/dsp",
    "@/services/FavoritesService": "@/features/favorites/api/service",
    "@/services/PlaylistService": "@/features/playlist/api/service",
    "@/services/hardware/USBDACService": "@/features/hardware/api/usb",
    "@/services/database/SQLiteService": "@/shared/lib/sqlite",
    
    # Native modules -> features/
    "@/services/native/NativeDSPModule": "@/features/visualizer/native/DSPModule",
    "@/services/native/VisualizerBridge": "@/features/visualizer/native/VisualizerBridge",
    "@/services/native/USBDACModule": "@/features/hardware/native/USBModule",
    "@/services/native/USBDACPackage": "@/features/hardware/native/USBPackage",
    
    # Types -> shared/ atau features/
    "@/types/audio": "@/shared/types/audio",
    "@/types/dac.types": "@/shared/types/dac",
    "@/types/dsp.types": "@/shared/types/dsp",
    "@/types/equalizer": "@/features/equalizer/types",
    "@/types/playlist": "@/features/playlist/types",
    
    # Utils -> shared/
    "@/utils/time": "@/shared/utils/time",
    "@/utils/permissions": "@/shared/utils/permissions",
    "@/utils/LrcParser": "@/shared/utils/LrcParser",
    
    # Constants
    "@/constants/equalizerPresets": "@/features/equalizer/constants/presets",
}

def log(message, level="INFO"):
    timestamp = datetime.now().strftime("%H:%M:%S")
    colors = {
        "INFO": "\033[94m",
        "SUCCESS": "\033[92m",
        "WARNING": "\033[93m",
        "ERROR": "\033[91m",
        "RESET": "\033[0m"
    }
    color = colors.get(level, colors["INFO"])
    print(f"{color}[{timestamp}] [{level}] {message}{colors['RESET']}")

def fix_imports_in_file(file_path):
    """Fix imports dalam satu file"""
    try:
        content = file_path.read_text(encoding='utf-8')
        original_content = content
        changes = []
        
        # Pattern untuk import statements
        import_pattern = r'from\s+[\'"]([^\'"]+)[\'"]'
        
        for old_path, new_path in IMPORT_MAPPINGS.items():
            # Escape special regex chars
            escaped_old = re.escape(old_path)
            # Match exact path atau path dengan /index
            pattern = rf'(from\s+[\'"]){escaped_old}(/index)?([\'"])'
            
            def replace_match(match):
                prefix = match.group(1)
                index_part = match.group(2) or ""
                suffix = match.group(3)
                return f"{prefix}{new_path}{index_part}{suffix}"
            
            new_content = re.sub(pattern, replace_match, content)
            
            if new_content != content:
                changes.append(f"{old_path} -> {new_path}")
                content = new_content
        
        if changes:
            file_path.write_text(content, encoding='utf-8')
            return changes
        
        return None
        
    except Exception as e:
        log(f"Error processing {file_path}: {e}", "ERROR")
        return None

def process_all_files():
    """Process semua .ts dan .tsx files"""
    log("Memperbaiki imports di semua file...", "INFO")
    
    # Cari semua ts/tsx files
    files = list(SRC_DIR.rglob("*.ts")) + list(SRC_DIR.rglob("*.tsx"))
    
    total_files = 0
    total_changes = 0
    changed_files = []
    
    for file_path in files:
        # Skip node_modules dan .d.ts
        if "node_modules" in str(file_path) or file_path.suffix == ".d.ts":
            continue
            
        changes = fix_imports_in_file(file_path)
        
        if changes:
            total_files += 1
            total_changes += len(changes)
            changed_files.append(f"{file_path.relative_to(SRC_DIR)} ({len(changes)} changes)")
            log(f"Fixed: {file_path.relative_to(SRC_DIR)}", "SUCCESS")
    
    log(f"\nSelesai: {total_files} files diperbaiki, {total_changes} total changes", "INFO")
    
    if changed_files:
        log("\nFiles yang diubah:", "INFO")
        for f in changed_files:
            log(f"  - {f}", "INFO")
    
    return total_files, total_changes

def verify_fix():
    """Verifikasi dengan tsc lagi"""
    log("\nVerifikasi dengan TypeScript...", "INFO")
    import subprocess
    result = subprocess.run(
        ["npx", "tsc", "--noEmit"],
        capture_output=True,
        text=True
    )
    
    # Hitung remaining errors
    error_count = result.stdout.count("error TS")
    log(f"Sisa error: {error_count}", "WARNING" if error_count > 0 else "SUCCESS")
    
    if error_count > 0:
        # Tampilkan beberapa error pertama
        lines = result.stdout.split('\n')
        for line in lines[:20]:
            if "error TS" in line:
                log(line, "WARNING")
    
    return error_count

def main():
    print("\n" + "="*60)
    print(" IMPORT FIXER SCRIPT")
    print("="*60 + "\n")
    
    # Fix semua imports
    files_fixed, changes_made = process_all_files()
    
    print("\n" + "="*60)
    print(" RINGKASAN")
    print("="*60)
    print(f"Files diperbaiki: {files_fixed}")
    print(f"Total changes: {changes_made}")
    print("="*60)
    
    # Verifikasi
    remaining = verify_fix()
    
    if remaining == 0:
        print("\n✅ SEMUA IMPORTS BERHASIL DIPERBAIKI!")
    else:
        print(f"\n⚠️  Masih ada {remaining} error yang perlu diperbaiki manual")
    
    print("\nCommand selanjutnya:")
    print("  npx expo prebuild --clean")
    print("  npx expo run:android")

if __name__ == "__main__":
    main()
 