# PristineAudio - Release Process

Versioning, alur build, signing, dan distribusi.

> **Diverifikasi 2026-10-03** ke `package.json`, `eas.json`, `android/app/build.gradle`, `.gitlab-ci.yml`, `.github/workflows/`.

---

## 1. Versioning

| Field | Lokasi | Nilai sekarang |
|---|---|---|
| Versi aplikasi | `app.json` -> `expo.version` | `1.0.37` |
| | `android/app/build.gradle` -> `versionName` | `1.0.37` |
| Version code | `android/app/build.gradle` -> `versionCode` | `1` |
| EAS | `eas.json` -> `cli.appVersionSource` | `remote` |

### Masalah: riwayat rilis tidak ada

- **Nol git tag.** `git tag` mengembalikan kosong.
- **Tidak ada `CHANGELOG.md`.** Lihat `CHANGELOG.md` di folder ini untuk state-nya sekarang.
- `appVersionSource: "remote"` berarti EAS mengelola nomor versi di sisi server. Tapi `versionCode: 1` di `build.gradle` masih literal.

**Konsekuensi praktis:** tidak ada cara merekonstruksi apa yang berubah antara `1.0.30` dan `1.0.37`. Satu-satunya jejak adalah riwayat git commit, yang tidak dikelompokkan per rilis.

**Rekomendasi:** mulai tag sekarang (`git tag v1.0.37` untuk state ini) dan isi `CHANGELOG.md` untuk rilis berikutnya. Lihat `ROADMAP.md` Fase 5.

## 2. Checklist Sebelum Rilis

Belum pernah dijalankan sebagai proses formal. Yang seharusnya:

1. `pnpm typecheck` - lulus
2. `bash scripts/check.sh` - lulus (butuh `compile_commands.json`)
3. `pnpm lint:check` - lulus
4. Manual QA di device - **lihat `TESTING.md` bagian 4**. Ini yang paling penting dan paling sering dilewatkan
5. Periksa izin di `AndroidManifest.xml` hasil build (`THREAT_MODEL.md` bagian 5)
6. Update `CHANGELOG.md`
7. Tag versi di git
8. Build lewat EAS atau CI

## 3. Alur Build

Tiga jalur paralel, tanpa sumber tunggal. **Ini sumber drift** - lihat `ARCHITECTURE.md` ADR-9.

### EAS (cara yang didokumentasikan di `package.json`)

```bash
pnpm build:dev        # --profile development, developmentClient, APK debug
pnpm build:preview    # --profile preview, APK, distribution internal
pnpm build:prod       # --profile production, app-bundle, distribution store
```

**Profile di `eas.json`:**

| Profile | Android | iOS | Distribution | Channel |
|---|---|---|---|---|
| `development` | APK `:app:assembleDebug`, medium | simulator, m1-medium | internal | development |
| `development-simulator` | (extends development) | simulator, medium | internal | development |
| `preview` | APK, medium | - | internal | (none) |
| `production` | app-bundle, large | large | store | production |

**Node dipin ke `20.19.4`** di semua profile. `autoIncrement: true`.

### GitLab CI (satu-satunya trigger otomatis)

`.gitlab-ci.yml` - jalan saat push ke branch `pristine-audio`:

1. `yarn install --frozen-lockfile --ignore-engines`
2. `npx patch-package`
3. Unduh Oboe 1.9.0 ke `android/app/src/main/cpp/oboe/`
4. `sdkmanager "ndk;27.1.12297006" "cmake;3.22.1"`
5. `./gradlew assembleDebug --no-daemon --no-parallel --max-workers=2` dengan `arm64-v8a` saja

### GitHub Actions (manual semua)

5 workflow, semuanya `workflow_dispatch`: `build.yml`, `build-dev.yml`, `build-preview.yml`, `runtime-test.yml`, `autolinking-debug.yml`.

## 4. Cacat yang harus diperbaiki

### `eas.json` cache key salah

```json
"cache": { "key": "development-{{ checksum \"yarn.lock\" }}" }
```

Proyek ini pakai **pnpm** (`pnpm-lock.yaml`). `yarn.lock` tidak ada. Cache key selalu gagal dihitung dengan benar - efeknya build lebih lambat, bukan gagal, tapi perbaiki sebelum bergantung pada cache.

### `.gitlab-ci.yml` pakai yarn, proyek pakai pnpm

`yarn install --frozen-lockfile` dengan `yarn.lock` yang tidak ada. Ia berjalan (mungkin lewat fallback), tapi tidak menggunakan `pnpm-lock.yaml`. **Ini berarti CI dan pengembangan lokal bisa menginstal dependensi versi berbeda.**

### `BUILD_TIMESTAMP` hardcoded di profile preview

```json
"env": { "BUILD_TIMESTAMP": "1776823853" }
```

Nilai itu timestamp tetap (sekitar April 2026). Namanya menyiratkan waktu build yang sebenarnya, tapi nilainya tidak akan pernah berubah. Kalau ada kode yang membacanya untuk menandai build, **tanda itu bohong**.

## 5. Signing

**Tidak ada konfigurasi signing di repo.**

```bash
grep -nE "signingConfig|keystore|storeFile|keyAlias" android/app/build.gradle
# (kosong - tidak ada hasil)
```

Artinya:

- Build debug memakai debug keystore standar Android
- **Build rilis akan memakai debug key juga**, kecuali EAS menanganinya sendiri
- APK yang ditandatangani debug key **tidak bisa dipasang menimpa** versi yang ditandatangani kunci rilis, dan **tidak bisa diunggah ke Play Store**

Persona membahas masalah identik ini secara panjang dan menambahkan pola verifikasi (bandingkan sidik jari sertifikat APK dengan keystore). PristineAudio belum punya apa pun di sini.

**EAS signing:** EAS mengelola keystore sendiri kalau tidak disediakan, dan itu **lebih baik** daripada tidak ada. Tapi itu berarti kunci signing ada di server Expo, bukan di tangan Anda, dan tidak ada backup lokal di repo.

## 6. Submit

`eas.json` mendefinisikan:

```json
"submit": { "production": { "android": {
  "serviceAccountKeyPath": "./google-service-account.json",
  "track": "internal", "releaseStatus": "completed"
} } }
```

**File `./google-service-account.json` tidak ada di repo** (dan tidak boleh di-commit). Untuk memakai `eas submit`, file itu harus disediakan.

**Ini bukan masalah sekarang** - `package.json` tidak punya skrip `submit` sama sekali, jadi alur ini belum pernah dijalankan.

## 7. Rollback

**Belum ada rencana rollback.** Tanpa git tag, tidak ada titik yang bisa dikembalikan. Ini konsekuensi langsung dari bagian 1 - dan alasan kenapa pencatatan rilis harus dimulai sebelum masalah pertama terjadi, bukan setelah.
