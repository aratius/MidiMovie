/* Pro / license settings. While enforce is false every feature is unlocked and no Pro UI is shown.
   To go live: create the product in Lemon Squeezy (license keys ON), fill in the IDs and checkout link below, set enforce to true. */
window.MM_LICENSE = {
  enforce: false,
  storeId: 0,            // Lemon Squeezy store id (Settings > Stores)   — keys sold by any other store are rejected
  productIds: [],        // e.g. [123456]  product id(s) of MidiMovie Pro  — keys for other products are rejected
  checkoutUrl: 'https://buy.stripe.com/test_28E9ALfTV2Ekbmo75f6wE00',       // the Lemon Squeezy checkout / buy link
  price: '¥2,980',       // shown in the dialog
  giftPublicKey: 'BNpwuFmjlGco8UGaP58kSZ8WCjvEqnWKcwh2-bkJnQrrnLOAlljEZICQeZdg02SbnB8WxLKKyjh_9pBKh-Rj4E0',     // public key printed by `node tools/license-keys.mjs init` — enables free gift keys (see docs/PRO-SETUP.md)
  revoked: [],           // ids of gift keys to switch off, e.g. ['a1b2c3']
  proxy: '',             // optional: URL of tools/license-proxy-worker.js if the browser blocks direct calls (CORS)
  contactEmail: '',      // shown on terms/privacy/tokushoho pages (empty = link to GitHub Issues). Set your public contact address here.
  keyApi: 'https://midimovie-license.aratius.workers.dev'             // Stripe route: URL of tools/stripe-license-worker.js (used by thanks.html)
};
