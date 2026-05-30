#pragma once

#include <jni.h>
#include <jsi/jsi.h>

namespace pristine {

void installJSI(
    JavaVM* vm,
    facebook::jsi::Runtime* runtime
);

}