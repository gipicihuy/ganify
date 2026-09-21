plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.ganify.app"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.ganify.app"
        minSdk = 24
        targetSdk = 34
        // versionName & versionCode di-update otomatis via release workflow dari VERSION/package.json (single source)
        versionCode = 3
        versionName = "1.0.2"
    }

    signingConfigs {
        create("release") {
            val ksPath = System.getenv("KEYSTORE_PATH") ?: "release.keystore"
            val f = file(ksPath)
            storeFile = f
            storePassword = System.getenv("KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KEY_ALIAS")
            keyPassword = System.getenv("KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // Hanya pakai release signing kalau keystore memang ada (di CI). Lokal tanpa keystore tetap bisa build.
            val ksPath = System.getenv("KEYSTORE_PATH") ?: "release.keystore"
            val hasKs = file(ksPath).exists() || file("release.keystore").exists()
            if (hasKs) signingConfig = signingConfigs.getByName("release")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures { viewBinding = false }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.9.0")
    // Native playback biar nyetel langsung di HP (background + lockscreen)
    implementation("androidx.media3:media3-exoplayer:1.4.1")
    implementation("androidx.media3:media3-session:1.4.1")
    implementation("androidx.media3:media3-common:1.4.1")
    implementation("androidx.media:media:1.6.0")
}
