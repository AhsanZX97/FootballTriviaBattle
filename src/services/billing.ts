import { isNative } from './platform'

/**
 * Google Play Billing, wrapped so the rest of the app never imports the plugin
 * directly. Same shape as ads.ts: the native module is imported lazily on
 * first use, so the web build never downloads it and boot is never slowed by
 * a store that most sessions won't touch.
 *
 * Nothing here decides what a purchase is worth or whether it was real — that
 * is the verify-coin-purchase edge function's job. This module only drives the
 * store UI and hands the resulting token over.
 */

let billingModule: Promise<typeof import('@capgo/native-purchases')> | null = null
function billing() {
  billingModule ??= import('@capgo/native-purchases')
  return billingModule
}

/** True when this device can actually take a payment. False on web, on an
 * emulator without Play Services, and when the Play Store app is too old. */
export async function isBillingAvailable(): Promise<boolean> {
  if (!isNative) return false
  try {
    const { NativePurchases } = await billing()
    const { isBillingSupported } = await NativePurchases.isBillingSupported()
    return isBillingSupported
  } catch {
    return false
  }
}

/**
 * Localized price strings from the Play Store, keyed by product id. Products
 * Play doesn't know about are simply absent from the result — the caller must
 * not offer those. One batched call: the plugin explicitly warns that
 * concurrent single-product lookups race.
 */
export async function fetchPrices(productIds: string[]): Promise<Record<string, string>> {
  if (!isNative || productIds.length === 0) return {}
  try {
    const { NativePurchases, PURCHASE_TYPE } = await billing()
    const { products } = await NativePurchases.getProducts({
      productIdentifiers: productIds,
      productType: PURCHASE_TYPE.INAPP,
    })
    return Object.fromEntries(products.map((p) => [p.identifier, p.priceString]))
  } catch {
    // No prices means no buy buttons, which is the right failure: better to
    // show nothing than a price we can't stand behind.
    return {}
  }
}

/** How a Play purchase attempt ended. `cancelled` covers the player backing
 * out, which is not an error and must not be reported as one. */
export type PurchaseAttempt =
  | { status: 'ok'; purchaseToken: string }
  | { status: 'cancelled' }
  | { status: 'unavailable' }

/**
 * Run the Play purchase sheet for one consumable coin pack.
 *
 * Both flags matter and are deliberately non-default:
 *
 * `isConsumable: false` and `autoAcknowledgePurchases: false` stop the plugin
 * from consuming or acknowledging the purchase for us. Consuming destroys the
 * token, which is the only proof of payment — it must not happen until our
 * server has verified it and banked the coins. `consume()` below is what
 * closes the loop, and consuming also acknowledges, which Google requires
 * within 3 days or it auto-refunds the player.
 */
export async function purchasePack(productId: string): Promise<PurchaseAttempt> {
  if (!isNative) return { status: 'unavailable' }
  try {
    const { NativePurchases, PURCHASE_TYPE } = await billing()
    const transaction = await NativePurchases.purchaseProduct({
      productIdentifier: productId,
      productType: PURCHASE_TYPE.INAPP,
      isConsumable: false,
      autoAcknowledgePurchases: false,
    })
    return transaction.purchaseToken
      ? { status: 'ok', purchaseToken: transaction.purchaseToken }
      : { status: 'unavailable' }
  } catch (err) {
    // The plugin rejects both when the player dismisses the sheet and when
    // something genuinely broke; the message is all we have to tell them
    // apart, and a dismissal must never surface as an error.
    const message = err instanceof Error ? err.message.toLowerCase() : ''
    return message.includes('cancel') ? { status: 'cancelled' } : { status: 'unavailable' }
  }
}

/**
 * Consume a purchase so the pack can be bought again, and — as a side effect
 * Google treats as equivalent — acknowledge it.
 *
 * Call this ONLY after the server has credited the coins. Never throws: a
 * failed consume leaves an unconsumed purchase, which the next
 * `listUnconsumed()` sweep picks up.
 */
export async function consume(purchaseToken: string): Promise<void> {
  if (!isNative) return
  try {
    const { NativePurchases } = await billing()
    await NativePurchases.consumePurchase({ purchaseToken })
  } catch (err) {
    console.error('[billing] consume failed', err)
  }
}

/** A purchase Play still holds against this account, i.e. one that was paid
 * for but never consumed. */
export interface PendingPurchase {
  productId: string
  purchaseToken: string
}

/**
 * Purchases Play is still holding — the app crashed between paying and
 * crediting, the verify call failed, or the consume did. Under Play Billing 8
 * a consumed purchase vanishes from this list entirely, so anything returned
 * here is by definition still owed to the player.
 *
 * Driving this on app open is what makes the money path recoverable: without
 * it a player who lost connectivity mid-purchase is simply out of pocket.
 */
export async function listUnconsumed(): Promise<PendingPurchase[]> {
  if (!isNative) return []
  try {
    const { NativePurchases, PURCHASE_TYPE } = await billing()
    const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP })
    return purchases
      .filter((p): p is typeof p & { purchaseToken: string } => Boolean(p.purchaseToken))
      .map((p) => ({ productId: p.productIdentifier, purchaseToken: p.purchaseToken }))
  } catch (err) {
    console.error('[billing] listUnconsumed failed', err)
    return []
  }
}
