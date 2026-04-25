pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

val nodeModulesDir = File(settingsDir, "../node_modules")

val rnGradlePlugin = File(nodeModulesDir, "@react-native/gradle-plugin")
val expoGradlePlugin = File(
    nodeModulesDir,
    "expo/node_modules/expo-modules-autolinking/android/expo-gradle-plugin"
).let { nested ->
    if (nested.exists()) nested
    else File(nodeModulesDir, "expo-modules-autolinking/android/expo-gradle-plugin")
}

includeBuild(rnGradlePlugin)
includeBuild(expoGradlePlugin)

plugins {
    id("com.facebook.react.settings")
    id("expo-autolinking-settings")
}

extensions.configure<com.facebook.react.ReactSettingsExtension> {
    autolinkLibrariesFromCommand(expoAutolinking.rnConfigCommand)
}

expoAutolinking.useExpoModules()

rootProject.name = "PristineAudio"

include(":app") 