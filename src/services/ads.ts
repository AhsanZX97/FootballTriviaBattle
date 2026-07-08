import { useEffect } from 'react'
import { isNative } from './platform'

/** Google's public test banner unit — always fills, safe to click. */
export const TEST_BANNER_AD_ID = 'ca-app-pub-3940256099942544/6300978111'

/**
 * Which banner ad unit to request. The real ID is baked in only by
 * release-mode builds (.env.release → npm run cap:sync:release); every other
 * build — dev server, debug `npm run android` APKs, the web deploy — falls
 * back to Google's test unit so nobody can click real ads by accident.
 */
export function resolveBannerAd(envId: string | undefined): {
  adId: string
  isTesting: boolean
} {
  return envId
    ? { adId: envId, isTesting: false }
    : { adId: TEST_BANNER_AD_ID, isTesting: true }
}

const banner = resolveBannerAd(import.meta.env.VITE_ADMOB_BANNER_ID)

// The native banner is an overlay, not part of the page — screens keep their
// buttons clear of it by padding with this CSS var. The plugin reports the
// height in dp (the WebView's CSS px scale) on load/resume and 0 on
// hide/remove/load-failure, so the padding tracks the overlay automatically.
export const BANNER_HEIGHT_CSS_VAR = '--ad-banner-height'

// showBanner() can't re-show after hideBanner() — the native view stays GONE
// and only resumeBanner() brings it back — so remember whether the view exists.
let bannerCreated = false

// SDK loaded + initialized lazily on first show: ads never slow down boot,
// and the web build never downloads the plugin at all.
let admobModule: Promise<typeof import('@capacitor-community/admob')> | null = null
function admob() {
  admobModule ??= import('@capacitor-community/admob').then(async (m) => {
    await m.AdMob.initialize({
      initializeForTesting: banner.isTesting,
      // The Play Console target audience includes children, declared with
      // "ads suitable for children: Yes" — every request must be tagged
      // child-directed and capped at G-rated ad content to keep that true.
      tagForChildDirectedTreatment: true,
      maxAdContentRating: m.MaxAdContentRating.General,
    })
    await m.AdMob.addListener(m.BannerAdPluginEvents.SizeChanged, ({ height }) => {
      document.documentElement.style.setProperty(BANNER_HEIGHT_CSS_VAR, `${height}px`)
    })
    // a failed load destroys the native view, so the next show must recreate it
    await m.AdMob.addListener(m.BannerAdPluginEvents.FailedToLoad, () => {
      bannerCreated = false
    })
    return m
  })
  return admobModule
}

export async function showBottomBanner(): Promise<void> {
  if (!isNative) return
  try {
    const { AdMob, BannerAdPosition, BannerAdSize } = await admob()
    if (bannerCreated) {
      await AdMob.resumeBanner()
    } else {
      bannerCreated = true
      await AdMob.showBanner({
        adId: banner.adId,
        isTesting: banner.isTesting,
        adSize: BannerAdSize.ADAPTIVE_BANNER,
        position: BannerAdPosition.BOTTOM_CENTER,
      })
    }
  } catch {
    // ads must never break the game — a banner that fails to show is just absent
  }
}

export async function hideBottomBanner(): Promise<void> {
  if (!isNative || !bannerCreated) return
  try {
    const { AdMob } = await admob()
    await AdMob.hideBanner()
  } catch {
    // hideBanner rejects if the banner never actually made it on screen
  }
}

/** Keeps the bottom banner on screen while `visible` is true, hidden otherwise. */
export function useBottomBanner(visible: boolean): void {
  useEffect(() => {
    if (!visible) return
    void showBottomBanner()
    return () => {
      void hideBottomBanner()
    }
  }, [visible])
}
