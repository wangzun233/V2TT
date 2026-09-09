pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        maven { url = uri("https://api.xposed.info/"); content { includeGroup("de.robv.android.xposed") } }
        maven { url = uri("https://jitpack.io"); content { includeGroupByRegex("com\\.github\\..*") } }
    }
}
rootProject.name = "V2TT-Android"
include(":app")
include(":manifest-tests")
include(":libxposed-api")
project(":libxposed-api").projectDir = file("third_party/libxposed-api")
