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

## 友達用のギフトキー(無料でProを渡す)

購入なし・サーバーなしで動く「署名付きキー」です。あなたの秘密鍵で署名し、サイト側は公開鍵で検証します。

1. 初回のみ: `node tools/license-keys.mjs init`
   - 表示された公開鍵を `license-config.js` の `giftPublicKey` に貼る。
   - 秘密鍵は `~/.midimovie/gift-private.pem` に作られる。**バックアップを取り、絶対に git に入れない**(`.gitignore` 済み)。失くすと新しいキーを発行できない。
2. 発行: `node tools/license-keys.mjs issue "友達の名前"`(期限付きは `--days 365`)
   - 出てきた `MMF1.…` を友達に送る。友達は Pro ダイアログのキー欄に貼るだけ。
3. 無効化: 発行時に表示される id を `license-config.js` の `revoked` に追加して push。
4. 確認: `node tools/license-keys.mjs verify <キー>`

`enforce:false` の間は全員が全機能を使えるので、キーが必要になるのは `enforce:true` にした後です。
