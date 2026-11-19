// Lazyload-fix (butir 3) + follow-up: negative cache URI artwork gagal,
// level modul — DIBAGI SongListItem + FloatingPlayer + layar Player.
// `imgError` saja adalah state per-mount (SongListItem) atau per-lagu
// (FloatingPlayer/Player) — URI artwork yang rusak dicoba lagi tiap
// baris masuk viewport saat fling (log: MediaMetadataRetriever
// "negative length" 9× untuk URI yang sama; ExpoImage gagal 34×).
// URI yang sekali terbukti gagal TIDAK dicoba lagi sampai restart app
// (scope sesi). Alternatif yang sengaja TIDAK diambil: TTL/eviction —
// artwork yang gagal karena file rusak tidak akan pulih dalam satu sesi;
// bila URI gagal karena file belum ada lalu muncul kemudian, restart app
// diperlukan (bukan ditebak).
// Key = URI mentah (tanpa ukuran): kegagalan yang sama terlihat di
// 132×132 (baris Library), 110×110 (FloatingPlayer), 598×597 (Player)
// — satu cache untuk ketiganya (logcat 08:06).

const failedArtworkUris = new Set<string>();

export function isFailedArtworkUri(uri: string | null | undefined): boolean {
  return !!uri && failedArtworkUris.has(uri);
}

export function markArtworkUriFailed(uri: string | null | undefined): void {
  if (uri) failedArtworkUris.add(uri);
}
