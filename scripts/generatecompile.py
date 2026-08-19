#!/usr/bin/env python3
"""
Generate compile_commands.json for clangd, based on the exact compiler
flags used by the pristine-audio CMake target (as seen in the CI build log).

Usage (run from the project root, e.g. ~/pristine):
    python generate_compile_commands.py

Output:
    android/app/src/main/cpp/compile_commands.json
"""

import json
import os
import subprocess

# Script lives in scripts/, project root is one level up
PROJECT_ROOT = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..")
)
CPP_ROOT = os.path.join(
    PROJECT_ROOT, "android", "app", "src", "main", "cpp"
)

# Directories to SKIP entirely — third-party Oboe library, its samples,
# tests, and bundled apps. You never edit these, and they may have their
# own separate build flags anyway.
SKIP_DIR_PREFIXES = (
    os.path.join(CPP_ROOT, "oboe"),
)

# The -I include list, copied from the actual CI compiler invocation.
INCLUDE_SUBDIRS = [
    "",
    "core",
    "manager",
    "modes",
    "playback",
    "decoder",
    "dsp",
    "dsp/graph",
    "dsp/tone",
    "dsp/spatial",
    "dsp/dynamics",
    "dsp/filters",
    "dsp/convolution",
    "dsp/immersive",
    "dsp/headphone",
    "fft",
    "devices",
    "usb",
    "realtime",
    "session",
    "profiling",
    "visualizer",
    "utils",
    "jni",
    "oboe/include",
]

DEFINES = [
    "-DARM_NEON=1",
    "-DDEBUG_BUILD=1",
    "-DOBOE_ENABLE_LOGGING=1",
    "-DPRISTINE_AUDIO_ENGINE=1",
    "-D__ARM_NEON=1",
    "-Dpristine_audio_EXPORTS",
    "-DANDROID",
    "-D__BIONIC_NO_PAGE_SIZE_MACRO",
    "-D_FORTIFY_SOURCE=2",
]

# Compile flags (target/sysroot are placeholders; clangd mainly needs
# -std, -D, and -I to resolve symbols correctly — it doesn't need to
# actually invoke the NDK toolchain for these to work, but we point at
# a real clang++ so include-path resolution for system/NDK headers works
# if you also have the NDK on this device. If you don't, clangd will still
# correctly resolve your own project headers, which is the main goal.)
COMPILER = "clang++"

BASE_FLAGS = [
    "-std=c++20",
    "-g",
    "-fdata-sections",
    "-ffunction-sections",
    "-funwind-tables",
    "-fstack-protector-strong",
    "-Wall",
    "-Wextra",
    "-Wno-unused-parameter",
    "-Wno-unused-variable",
    "-Wno-missing-field-initializers",
    "-ffast-math",
    "-fstrict-aliasing",
    "-fvisibility=hidden",
    "-march=armv8-a+fp+simd",
]


def should_skip(path):
    return any(
        path.startswith(prefix + os.sep) or path == prefix
        for prefix in SKIP_DIR_PREFIXES
    )


def find_cpp_files():
    result = []
    for dirpath, dirnames, filenames in os.walk(CPP_ROOT):
        if should_skip(dirpath):
            dirnames[:] = []
            continue
        for f in filenames:
            if f.endswith(".cpp"):
                result.append(os.path.join(dirpath, f))
    return sorted(result)


def build_command(filepath):
    includes = [
        f"-I{os.path.join(CPP_ROOT, sub)}" if sub else f"-I{CPP_ROOT}"
        for sub in INCLUDE_SUBDIRS
    ]

    args = [COMPILER] + DEFINES + includes + BASE_FLAGS + [
        "-c",
        filepath,
        "-o",
        filepath + ".o",
    ]

    return {
        "directory": CPP_ROOT,
        "file": filepath,
        "arguments": args,
    }


def main():
    files = find_cpp_files()

    if not files:
        print("No .cpp files found under", CPP_ROOT)
        return

    entries = [build_command(f) for f in files]

    out_path = os.path.join(CPP_ROOT, "compile_commands.json")
    with open(out_path, "w") as fh:
        json.dump(entries, fh, indent=2)

    print(f"Wrote {len(entries)} entries to {out_path}")


if __name__ == "__main__":
    main()
