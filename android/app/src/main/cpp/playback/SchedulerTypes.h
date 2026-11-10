// SchedulerTypes.h
//
// 🔥 DIPANGKAS (2026-11-10, dead-code playback): file ini dulu berisi
// TransitionMode, TransitionConfig, SchedulerState, dan 3 struct event
// untuk scheduler/prebuffer yang tidak pernah dibangun — 0 pemakai di
// seluruh cpp/ (audit playback 2026-11-10). Yang tersisa hanya FadeCurve,
// dipakai FadeEngine (sekarang hidup, P-M7). Kalau scheduler dibangun
// lagi suatu hari, tipe-tipe itu dibuat ulang dari kebutuhan nyata,
// bukan dari file ini.
#pragma once

namespace pristine::playback {

// =====================================================
// FADE CURVE
// =====================================================

enum class FadeCurve {
    Linear,
    Logarithmic,
    Exponential,
    SCurve
};

}
