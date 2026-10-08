/* Pro / license settings. While enforce is false every feature is unlocked and no Pro UI is shown.
   To go live: create the product in Lemon Squeezy (license keys ON), fill in the IDs and checkout link below, set enforce to true. */
window.MM_LICENSE = {
  enforce: false,
  storeId: 0,            // Lemon Squeezy store id (Settings > Stores)   — keys sold by any other store are rejected
  productIds: [],        // e.g. [123456]  product id(s) of MidiMovie Pro  — keys for other products are rejected
  checkoutUrl: '',       // the Lemon Squeezy checkout / buy link
  price: '¥2,980',       // shown in the dialog
  proxy: ''              // optional: URL of tools/license-proxy-worker.js if the browser blocks direct calls (CORS)
};
