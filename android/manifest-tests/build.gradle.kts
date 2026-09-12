plugins { kotlin("jvm") }

dependencies {
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.10.0")
    testImplementation("junit:junit:4.13.2")
}
kotlin { jvmToolchain(21) }
sourceSets.main {
    kotlin.srcDir("../app/src/main/java/io/nekohasekai/sfa/v2tt")
    kotlin.include("DeviceManifest.kt")
    kotlin.include("ClientUpdate.kt")
}
tasks.test {
    systemProperty("serverExample", rootProject.file("../server/subscription.example.json").absolutePath)
    systemProperty("rulesDir", rootProject.file("app/src/main/assets/v2tt-rules").absolutePath.replace('\\', '/'))
    systemProperty("configOutput", layout.buildDirectory.dir("generated-configs").get().asFile.absolutePath)
}
