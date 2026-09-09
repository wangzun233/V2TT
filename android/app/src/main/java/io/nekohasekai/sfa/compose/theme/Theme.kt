package io.nekohasekai.sfa.compose.theme

import android.app.Activity
import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme =
    darkColorScheme(
        primary = SingBoxPrimary,
        secondary = SingBoxPrimaryLight,
        tertiary = LogBlue,
        primaryContainer = Color(0xFF183D65),
        onPrimaryContainer = Color(0xFFD7E9FF),
        secondaryContainer = Color(0xFF163F39),
        onSecondaryContainer = Color(0xFFC6F0E6),
        background = Color(0xFF151719),
        surface = Color(0xFF151719),
        surfaceContainer = Color(0xFF202426),
        surfaceContainerHigh = Color(0xFF292E30),
    )

private val LightColorScheme =
    lightColorScheme(
        primary = SingBoxPrimary,
        secondary = SingBoxPrimaryDark,
        tertiary = LogBlue,
        primaryContainer = Color(0xFFE0EDFF),
        onPrimaryContainer = Color(0xFF12345D),
        secondaryContainer = Color(0xFFDEF3EB),
        onSecondaryContainer = Color(0xFF123B30),
        background = Color(0xFFF7F9FB),
        surface = Color(0xFFF7F9FB),
        surfaceContainer = Color(0xFFEEF2F5),
        surfaceContainerHigh = Color(0xFFE7EDF2),
    )

@Composable
fun SFATheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    // Dynamic color is available on Android 12+
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit,
) {
    val colorScheme =
        when {
            dynamicColor && Build.VERSION.SDK_INT >= 31 -> {
                val context = LocalContext.current
                if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
            }

            darkTheme -> DarkColorScheme
            else -> LightColorScheme
        }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            window.statusBarColor = colorScheme.surface.toArgb()
            window.navigationBarColor = colorScheme.background.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !darkTheme
                isAppearanceLightNavigationBars = !darkTheme
            }
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        shapes = Shapes,
        content = content,
    )
}
