#!/data/data/com.termux/files/usr/bin/python3
"""Fix 1b: service block PlaybackService — exported=false, stopWithTask, no intent-filter."""
from pathlib import Path

MF = Path.home() / "pristine/android/app/src/main/AndroidManifest.xml"
src = MF.read_text()

# Pattern targeted — hanya block PlaybackService, cegah hapus intent-filter lain
old = '''<service
            android:name="com.pristineaudio.playback.PlaybackService"
            android:foregroundServiceType="mediaPlayback"
            android:exported="true">

            <intent-filter>
                <action android:name="androidx.media.MediaBrowserServiceCompat"/>
            </intent-filter>
        </service>'''

new = '''<service
            android:name="com.pristineaudio.playback.PlaybackService"
            android:foregroundServiceType="mediaPlayback"
            android:exported="false"
            android:stopWithTask="false" />'''

if 'android:stopWithTask="false"' in src and 'PlaybackService' in src:
    print("⏭️  Already patched (stopWithTask present)")
elif old in src:
    src = src.replace(old, new, 1)
    MF.write_text(src)
    print("✅ 1b applied: exported=false + stopWithTask=false + intent-filter removed")
else:
    # Fallback: regex lebih toleran
    import re
    # Match service block PlaybackService
    pattern = re.compile(
        r'(<service\s+[^>]*PlaybackService[^>]*?)'
        r'android:exported="true">\s*'
        r'<intent-filter>\s*'
        r'<action\s+android:name="androidx\.media\.MediaBrowserServiceCompat"\s*/>\s*'
        r'</intent-filter>\s*'
        r'</service>',
        re.DOTALL
    )
    def replacer(m):
        prefix = m.group(1)
        return (prefix +
                'android:exported="false"\n'
                '            android:stopWithTask="false" />')
    new_src, n = pattern.subn(replacer, src, count=1)
    if n > 0:
        MF.write_text(new_src)
        print("✅ 1b applied (regex fallback)")
    else:
        print("❌ 1b masih gagal — pattern tidak match")
        print("Paste 15 baris di sekitar PlaybackService untuk debug")