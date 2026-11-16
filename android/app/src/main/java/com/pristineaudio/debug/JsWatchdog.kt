package com.pristineaudio.debug

// Diagnostik tidur JS — HANYA untuk branch app-debug, jangan merge ke release.
// Watchdog native: memantau detak getPosition() (dipanggil JS tiap 500 ms lewat
// position watcher). Kalau detak berhenti > 3 dtk, dump state + CPU + stack
// thread JS dan main — membedakan JS SIBUK (R, utime naik) vs MENUNGGU (S/D,
// utime diam). Dipasang atas usulan Sonnet, diverifikasi di
// VERIFIKASI-SONNET-LOGCAT28.md (butir 5).
object JsWatchdog {
    @Volatile private var lastBeat = android.os.SystemClock.elapsedRealtime()
    fun beat() { lastBeat = android.os.SystemClock.elapsedRealtime() }   // dipanggil dari NativePlaybackService.getPosition() (hanya JS yang memanggil)

    fun start() {
        Thread({
            var lastDump = 0L
            while (true) {
                Thread.sleep(1000)
                val now = android.os.SystemClock.elapsedRealtime()
                val gap = now - lastBeat
                if (gap > 3000 && now - lastDump > 3000) { lastDump = now; dump(gap) }
            }
        }, "js-watchdog").apply { isDaemon = true }.start()
    }

    private fun dump(gap: Long) {
        for ((t, st) in Thread.getAllStackTraces()) {
            if ((t.name.contains("js", true) || t.name == "main") && t.name != "js-watchdog") {
                android.util.Log.w("JsWatchdog", "gap=${gap}ms thread=${t.name} state=${t.state}\n" +
                    st.take(15).joinToString("\n") { "  at $it" })
            }
        }
        java.io.File("/proc/self/task").listFiles()?.forEach { d ->
            val comm = runCatching { java.io.File(d, "comm").readText().trim() }.getOrDefault("")
            if (comm.contains("mqt_v_js")) {
                val f = runCatching { java.io.File(d, "stat").readText() }.getOrDefault("")
                    .substringAfterLast(')').trim().split(' ')
                // f[0]=state (R/S/D), f[11]=utime, f[12]=stime (tick). Dua dump berurutan: delta CPU = beku atau sibuk
                android.util.Log.w("JsWatchdog", "tid=${d.name} comm=$comm state=${f.getOrNull(0)} utime=${f.getOrNull(11)} stime=${f.getOrNull(12)}")
            }
        }
    }
}
