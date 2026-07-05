import { Capacitor } from '@capacitor/core'

/**
 * True inside a Capacitor native WebView (Android/iOS), false on the deployed
 * web app. Every native-only style and behaviour hangs off this flag so the
 * web build stays the app it is today — on web `isNativePlatform()` returns
 * false without any native runtime present.
 */
export const isNative = Capacitor.isNativePlatform()
