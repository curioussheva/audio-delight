package com.pristineaudio.playback

import android.content.ContentResolver
import android.net.Uri
import java.io.File

/**
 * B9-cacheval (2026-11-12): validasi cache content:// sebelum hit.
 *
 * Masalah: hit-check lama hanya `exists() && length() > 0` — file yang
 * diganti/di-retag dengan URI sama (media id tidak berubah) tetap dianggap
 * hit basi, dan lagu lama yang diputar.
 *
 * KEPUTUSAN DESAIN (didokumentasikan di sini + di ContentUriResolver.cpp,
 * yang mengimplementasikan logika yang SAMA lewat JNI):
 *
 * 1. Metadata dibaca LANGSUNG dari provider lewat
 *    `ContentResolver.query(uri, ...)` pada TIAP hit-check — TANPA sidecar,
 *    TANPA mengubah nama cache (nama tetap `audio_<fnv1a64-hex>.<ext>`,
 *    B9-cache64). Satu query tanpa baca isi file itu murah dibanding
 *    salin ulang, dan karena metadata selalu fresh dari provider, CACHE
 *    LAMA (dibuat sebelum item ini, tanpa metadata tersimpan) tetap
 *    tervalidasi — tidak ada migrasi, tidak ada file tambahan, dan
 *    `clearCache` tidak perlu berubah.
 * 2. `_size` (OpenableColumns.SIZE) — ada di MediaStore, DocumentsProvider,
 *    dan kebanyakan provider lain. Dibandingkan PERSIS dengan
 *    `file.length()`: beda -> MISS, salin ulang.
 * 3. `date_modified` (MediaStore.MediaColumns.DATE_MODIFIED, detik) —
 *    HANYA MediaStore. Provider lain tidak punya kolom ini: query dengan
 *    kolom itu melempar IllegalArgumentException (dicoba ulang hanya
 *    dengan `_size`), atau `getColumnIndex` mengembalikan -1. Tanggal
 *    dibandingkan dengan `lastModified()` file cache — mtime cache ≈ waktu
 *    salin (temp ditulis lalu rename, mtime dipertahankan): sumber
 *    dianggap basi bila `date_modified > lastModified/1000`.
 *    Sisa blind spot (terdokumentasikan, di luar lingkup item ini): file
 *    diganti dalam DETIK YANG SAMA dengan ukuran yang SAMA tidak
 *    terdeteksi tanpa hash isi.
 * 4. Bila metadata TIDAK BISA DIBACA (cursor null/kosong, provider
 *    melempar, kolom `_size` bernilai NULL/-1 dan tanpa tanggal) ->
 *    fallback ke perilaku lama (hit bila exists + length > 0). Pemutaran
 *    tidak pernah digagalkan oleh validasi ini.
 * 5. Validasi HARUS di semua jalur hit-check yang hidup — ketiganya
 *    berbagi satu namespace file cache, jadi satu jalur yang tidak
 *    divalidasi sudah cukup untuk menghidangkan hit basi:
 *    NativePlaybackService (pre-resolve + on-demand),
 *    NativePlaybackModule (setQueue eager), dan native
 *    ContentUriResolver::resolve() (fallback dekoder untuk trek deferred).
 *    Kedua sisi Kotlin memakai helper ini supaya tidak divergen.
 */
object ContentCacheValidator {

    /**
     * true = cache boleh dipakai (hit valid); false = MISS, panggil
     * salin ulang seperti biasa (temp + rename menimpa target).
     * Sudah mencakup cek `exists() && length() > 0`.
     */
    fun isCacheHit(resolver: ContentResolver, uri: Uri, file: File): Boolean {
        if (!file.exists() || file.length() <= 0L) return false
        val (size, dateModifiedSec) = querySourceMetadata(resolver, uri)
            ?: return true // metadata tak tersedia -> perilaku lama (hit)
        if (size != null && size != file.length()) return false
        if (dateModifiedSec != null &&
            dateModifiedSec > file.lastModified() / 1000L
        ) {
            return false
        }
        return true
    }

    /**
     * null = metadata tidak bisa dibaca sama sekali (cursor null/kosong,
     * provider melempar) -> pemanggil fallback ke perilaku lama.
     * Pair(sizeBytes?, dateModifiedSec?) — tiap elemen null = kolom tak
     * tersedia / bernilai NULL di provider.
     */
    private fun querySourceMetadata(
        resolver: ContentResolver,
        uri: Uri,
    ): Pair<Long?, Long?>? {
        // Percobaan 1: [_size, date_modified]; bila provider menolak kolom
        // date_modified -> percobaan 2: [_size] saja.
        val projections = arrayOf(
            arrayOf(
                android.provider.OpenableColumns.SIZE,
                android.provider.MediaStore.MediaColumns.DATE_MODIFIED,
            ),
            arrayOf(android.provider.OpenableColumns.SIZE),
        )
        for (projection in projections) {
            try {
                resolver.query(uri, projection, null, null, null)?.use { cursor ->
                    if (!cursor.moveToFirst()) return null
                    val sizeIdx =
                        cursor.getColumnIndex(android.provider.OpenableColumns.SIZE)
                    val dateIdx = cursor.getColumnIndex(
                        android.provider.MediaStore.MediaColumns.DATE_MODIFIED,
                    )
                    val size = if (sizeIdx >= 0 && !cursor.isNull(sizeIdx)) {
                        cursor.getLong(sizeIdx).takeIf { it >= 0L }
                    } else {
                        null
                    }
                    val date = if (dateIdx >= 0 && !cursor.isNull(dateIdx)) {
                        cursor.getLong(dateIdx).takeIf { it >= 0L }
                    } else {
                        null
                    }
                    if (size == null && date == null) return null
                    return Pair(size, date)
                } ?: return null
            } catch (e: IllegalArgumentException) {
                // Kolom date_modified tidak dikenal provider ini -> coba
                // lagi hanya dengan _size (proyeksi kedua). Kalau proyeksi
                // kedua juga melempar, loop habis -> null di bawah.
                continue
            } catch (e: Exception) {
                return null
            }
        }
        return null
    }
}
