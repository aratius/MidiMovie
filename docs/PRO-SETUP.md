# MidiMovie Pro — going live checklist

Pro is a one-time purchase sold through Lemon Squeezy. Until `license-config.js` has `enforce: true`, **every feature stays unlocked** and no Pro UI is shown.

## What is Pro (free vs Pro)
Free: recording, note editor, markers, all presets, WAV mix export, MIDI export/import, project backup.
Pro: Sampler (incl. auto chop), Audio → MIDI (melody + chords), Video (MP4) export, Stems export.
To change the split, edit the `Pro.require('…')` calls in `ui.js` and the `data-pro` attributes in `editor.html`.

## 1. Lemon Squeezy
1. Create an account and a store; complete payout / tax details.
2. Create a product "MidiMovie Pro": single payment, ¥2,980 (or $ price), **License keys: ON**, activation limit e.g. 3 devices.
3. Note: the **store id**, the **product id**, and the product's **checkout (buy) link**.
4. Do a test-mode purchase and copy the key it emails.

## 2. Fill in `license-config.js`
```js
window.MM_LICENSE = { enforce: true, storeId: <store id>, productIds: [<product id>], checkoutUrl: '<buy link>', price: '¥2,980', proxy: '' };
```
Keep `enforce: false` until step 3 passes. `storeId` / `productIds` stop keys from other Lemon Squeezy stores from working here.

## 3. Test on the real site
Open the editor → Export → "Stems (ZIP)" → the Pro dialog appears → paste the test key → "Pro is on".
- If activation fails with a network error although you are online, the browser is probably blocking the call (CORS). Deploy `tools/license-proxy-worker.js` as a free Cloudflare Worker, add your site origin inside it, and set its URL as `proxy`.
- A key works on up to the activation limit; users can free a slot with "Deactivate this device".
- The app re-checks the key online about once a week (refunded keys stop working). Offline is fine for 60 days.

## 4. Before announcing
- Own domain + landing page (screenshots, the free-vs-Pro list, a short demo video).
- Legal pages: Terms of use, Privacy policy, and (selling in Japan) the 特定商取引法に基づく表記.
- Support contact address; refund policy sentence.
- Check the app name / preset names for trademark clashes (J-PlatPat).

This licence check protects honest buyers only; anyone can bypass client-side code. That is a normal trade-off for a static, serverless app.
