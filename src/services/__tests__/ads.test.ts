import { describe, expect, it } from 'vitest'
import { resolveBannerAd, TEST_BANNER_AD_ID } from '../ads'

describe('resolveBannerAd', () => {
  it('uses the real ad unit in non-testing mode when the env id is set', () => {
    expect(resolveBannerAd('ca-app-pub-7656537208669381/4747760334')).toEqual({
      adId: 'ca-app-pub-7656537208669381/4747760334',
      isTesting: false,
    })
  })

  it("falls back to Google's test banner when the env id is undefined", () => {
    expect(resolveBannerAd(undefined)).toEqual({
      adId: TEST_BANNER_AD_ID,
      isTesting: true,
    })
  })

  it('treats an empty env id as unset', () => {
    expect(resolveBannerAd('')).toEqual({
      adId: TEST_BANNER_AD_ID,
      isTesting: true,
    })
  })
})
