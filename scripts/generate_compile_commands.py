#!/usr/bin/env python3
"""
Generate compile_commands.json for clangd.
Sync dengan build flags aktual + RN includes.
"""

import json
import os
import glob

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CPP_ROOT = os.path.join(PROJECT_ROOT, "android", "app", "src", "main", "cpp")
NODE_MODULES = os.path.join(PROJECT_ROOT, "node_modules")

SKIP_DIR_PREFIXES = (os.path.join(CPP_ROOT, "oboe"),)

INCLUDE_SUBDIRS = [
    "", "core", "manager", "modes", "playback", "decoder",
    "dsp", "dsp/graph", "dsp/tone", "dsp/spatial", "dsp/dynamics",
    "dsp/filters", "dsp/convolution", "dsp/immersive", "dsp/headphone",
    "fft", "devices", "usb", "realtime", "session", "profiling",
    "visualizer", "utils", "jni", "resampler", "oboe/include",
]

# React Native includes
RN_ROOT = os.path.join(NODE_MODULES, "react-native")
RN_INCLUDES = [
    f"{RN_ROOT}/ReactCommon",
    f"{RN_ROOT}/ReactCommon/jsi",
    f"{RN_ROOT}/ReactCommon/react/bridging",
    f"{RN_ROOT}/ReactCommon/react/renderer/animations",
    f"{RN_ROOT}/ReactCommon/react/renderer/componentregistry",
    f"{RN_ROOT}/ReactCommon/react/renderer/core",
    f"{RN_ROOT}/ReactCommon/react/renderer/debug",
    f"{RN_ROOT}/ReactCommon/react/renderer/graphics",
    f"{RN_ROOT}/ReactCommon/react/renderer/mapbuffer",
    f"{RN_ROOT}/ReactCommon/react/renderer/mounting",
    f"{RN_ROOT}/ReactCommon/react/renderer/scheduler",
    f"{RN_ROOT}/ReactCommon/react/renderer/templateprocessor",
    f"{RN_ROOT}/ReactCommon/react/renderer/uimanager",
    f"{RN_ROOT}/ReactCommon/react/utils",
    f"{RN_ROOT}/ReactCommon/callinvoker",
    f"{RN_ROOT}/ReactCommon/turbomodule/core",
    f"{RN_ROOT}/ReactCommon/runtimeexecutor",
    f"{RN_ROOT}/ReactAndroid/src/main/jni",
    f"{RN_ROOT}/ReactAndroid/src/main/jni/react/jni",
    f"{RN_ROOT}/ReactAndroid/src/main/jni/react/turbomodule",
]

DEFINES = [
    "-DARM_NEON=1",
    "-DDEBUG_BUILD=1",
    "-DENABLE_FFMPEG=1",
    "-DOBOE_ENABLE_LOGGING=1",
    "-DPRISTINE_AUDIO_ENGINE=1",
    "-DRN_SERIALIZABLE_STATE",
    "-D__ARM_NEON=1",
    "-Dpristine_audio_EXPORTS",
    "-DANDROID",
    "-D__BIONIC_NO_PAGE_SIZE_MACRO",
    "-D_FORTIFY_SOURCE=2",
]

def find_compiler():
    ndk = os.environ.get("ANDROID_NDK_HOME") or os.environ.get("ANDROID_NDK_ROOT")
    if ndk:
        candidates = glob.glob(
            f"{ndk}/toolchains/llvm/prebuilt/*/bin/aarch64-linux-android24-clang++"
        )
        if candidates:
            return candidates[0]
    for ndk_path in glob.glob(
        "/data/data/com.termux/files/usr/opt/android-ndk*/toolchains/llvm/prebuilt/*/bin/aarch64-linux-android24-clang++"
    ):
        return ndk_path
    return "clang++"

COMPILER = find_compiler()

BASE_FLAGS = [
    "-std=c++20", "-g",
    "-fdata-sections", "-ffunction-sections", "-funwind-tables",
    "-fstack-protector-strong",
    "-fexceptions", "-frtti", "-fno-fast-math",
    "-fstrict-aliasing", "-fvisibility=hidden",
    "-Wall", "-Wextra",
    "-Wno-unused-parameter", "-Wno-unused-variable",
    "-Wno-missing-field-initializers",
]


def should_skip(path):
    return any(path.startswith(p + os.sep) or path == p for p in SKIP_DIR_PREFIXES)


def find_cpp_files():
    result = []
    for dirpath, dirnames, filenames in os.walk(CPP_ROOT):
        if should_skip(dirpath):
            dirnames[:] = []
            continue
        for f in filenames:
            if f.endswith(".cpp") and ".bak" not in f:
                result.append(os.path.join(dirpath, f))
    return sorted(result)


def build_command(filepath):
    includes = [f"-I{CPP_ROOT}"]
    includes += [f"-I{os.path.join(CPP_ROOT, sub)}" for sub in INCLUDE_SUBDIRS[1:]]

    for inc in RN_INCLUDES:
        if os.path.isdir(inc):
            includes.append(f"-I{inc}")

    ffmpeg_include = os.path.join(CPP_ROOT, "libs", "ffmpeg", "arm64-v8a", "include")
    if os.path.isdir(ffmpeg_include):
        includes.append(f"-I{ffmpeg_include}")

    sysroot_flags = []
    if "ndk" in COMPILER.lower() or "android-ndk" in COMPILER:
        ndk_root = COMPILER.split("/toolchains/")[0]
        prebuilt = glob.glob(f"{ndk_root}/toolchains/llvm/prebuilt/*")
        if prebuilt:
            sysroot_flags = [
                "--target=aarch64-none-linux-android24",
                f"--sysroot={prebuilt[0]}/sysroot",
            ]

    arch_flags = []
    if "android" in COMPILER.lower() or "aarch64" in COMPILER:
        arch_flags = ["-march=armv8-a+fp+simd"]

    args = (
        [COMPILER] + sysroot_flags + DEFINES + includes
        + BASE_FLAGS + arch_flags
        + ["-c", filepath, "-o", filepath + ".o"]
    )

    return {"directory": CPP_ROOT, "file": filepath, "arguments": args}


def main():
    files = find_cpp_files()
    if not files:
        print("❌ No .cpp files found.")
        return 1

    entries = [build_command(f) for f in files]

    out_path = os.path.join(CPP_ROOT, "compile_commands.json")
    with open(out_path, "w") as fh:
        json.dump(entries, fh, indent=2)

    ffmpeg_inc = any("libs/ffmpeg" in str(e) for e in entries)
    rn_inc = any("ReactCommon" in str(e) for e in entries)

    print(f"✅ Compiler: {COMPILER}")
    print(f"✅ Entries: {len(entries)}")
    print("")
    print("=== Flags check ===")
    print(f"  FFmpeg include:   {'✅' if ffmpeg_inc else '❌ missing'}")
    print(f"  ReactCommon:      {'✅' if rn_inc else '❌ missing'}")
    print("")
    return 0


if __name__ == "__main__":
    exit(main())
