import { describe, expect, it } from 'vitest'
import { resolveBannerAd, resolveRewardedAd, TEST_BANNER_AD_ID, TEST_REWARDED_AD_ID } from '../ads'

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

describe('resolveRewardedAd', () => {
  it('uses the real ad unit in non-testing mode when the env id is set', () => {
    expect(resolveRewardedAd('ca-app-pub-7656537208669381/1234567890')).toEqual({
      adId: 'ca-app-pub-7656537208669381/1234567890',
      isTesting: false,
    })
  })

  it("falls back to Google's test rewarded unit when the env id is undefined", () => {
    expect(resolveRewardedAd(undefined)).toEqual({
      adId: TEST_REWARDED_AD_ID,
      isTesting: true,
    })
  })

  it('treats an empty env id as unset', () => {
    expect(resolveRewardedAd('')).toEqual({
      adId: TEST_REWARDED_AD_ID,
      isTesting: true,
    })
  })

  it('is a different unit from the banner, so the two can never be swapped', () => {
    expect(TEST_REWARDED_AD_ID).not.toBe(TEST_BANNER_AD_ID)
  })
})
