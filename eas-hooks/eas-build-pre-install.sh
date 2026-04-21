#!/bin/bash
echo "Downloading Oboe 1.9.0..."
OBOE_DIR="android/app/src/main/cpp/oboe"
mkdir -p "$OBOE_DIR"
curl -L https://github.com/google/oboe/archive/refs/tags/1.9.0.tar.gz -o oboe.tar.gz
tar -xzf oboe.tar.gz --strip-components=1 -C "$OBOE_DIR"
rm oboe.tar.gz
echo "Oboe ready: $(ls $OBOE_DIR | wc -l) files"
