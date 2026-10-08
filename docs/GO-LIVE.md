# 本番公開の手順(上から順にやるだけ)

所要時間の目安: 1〜2時間(Stripe の審査待ちを除く)。
URL は **dashboard.stripe.com** のものを使います。画面の文言は Stripe の更新で少し変わることがあります。

凡例: 🖥 = Mac のターミナル / 🌐 = ブラウザ / 💬 = Claude に連絡

---

## 0. 事前確認

- [ ] 🖥 最新を取り込む
  ```
  cd ~/git/_Envs/_AI/MidiMovie
  git pull
  ```
- [ ] 🌐 https://midimovie.aualrxse.com/terms.html / privacy.html / tokushoho.html が開く(どれも日本語の本文が出る)
- [ ] 公開したい**連絡先メール**を決める(特商法・規約に載ります。個人の Gmail ではなく専用アドレスがおすすめ)

## 1. Stripe アカウントを本番で使えるようにする

1. 🌐 https://dashboard.stripe.com を開く
2. 画面上部に「アカウントを有効化」「Activate your account」などのバナーがあれば押す(なければ 左上のアカウント名 → 設定 → ビジネス設定 → 「アカウントを有効化」)
3. 次を入力して送信する
   - 事業形態: **個人事業主 / Individual**
   - 氏名・生年月日・住所(本人確認用。Stripe にだけ渡され、サイトには出ません)
   - 事業内容: `MidiMovie はブラウザで動画に MIDI で音楽をつけるツール。買い切りのソフトウェアライセンスを販売` / 商品: デジタル商品
   - サイトURL: `https://midimovie.aualrxse.com/`
   - 銀行口座(日本円の受取口座)
   - 本人確認書類のアップロードを求められたら従う
4. 設定 → 「公開情報(Public details)」 で、**サポート用メール**と、カード明細に出る名称(`MIDIMOVIE` など)を入れる
5. ✅ ダッシュボード上部に「テストモード」の表示が**ない**状態(本番)で、商品やペイメントの画面が開けること

## 2. 本番モードで商品を作る

1. 🌐 画面右上(または左上)の **テストモード/サンドボックスのスイッチをオフ**にして本番に切り替える
   - 上部のオレンジの「テストモード」帯が消えていれば本番です
2. 🌐 https://dashboard.stripe.com/products を開く → **商品を追加(Add product)**
3. 入力
   - 名前: `MidiMovie Pro`
   - 説明: `MidiMovie の Pro 機能(サンプラー、音声→MIDI 変換、MP4 書き出し、ステム書き出し)を解放する買い切りライセンス`
   - 商品カテゴリ(税コード): 「Select a tax code」→ 検索欄に `downloadable` → **Downloadable Software - personal use** (対象外と出たら business use → SaaS の順に試す)
   - 価格: **One-off(単発)** をクリック(Recurring ではない)
   - 金額: **USD 19**、通貨を追加 (Add more currencies) で **JPY 2980**
   - 税込み価格(Include tax in price): JPY は **Yes**
4. **商品を追加** を押す

## 3. 本番の Payment Link を作る

1. 🌐 https://dashboard.stripe.com/payment-links を開く → **作成 / New**
2. 商品に **MidiMovie Pro** を選ぶ(数量の変更は許可しない)
3. オプション
   - **Enable Managed Payments**: オン(カテゴリ対象外と出たら商品のカテゴリを選び直す)
   - **Collect customer names**: オン
   - Allow promotion codes: 任意(割引コードを使うならオン)
   - 規約への同意: 規約 URL `https://midimovie.aualrxse.com/terms.html` が設定できるなら設定してオン
4. **After payment(決済後)** → **Redirect customers to your website(自分のサイトにリダイレクト)**
   - URL: `https://midimovie.aualrxse.com/thanks.html?session_id={CHECKOUT_SESSION_ID}`
   - `{CHECKOUT_SESSION_ID}` は波かっこも含めてそのまま
5. **リンクを作成** → 出てきた `https://buy.stripe.com/…`(`test_` が**付かない**)を控える

## 4. 本番用の制限付きキー

1. 🌐 https://dashboard.stripe.com/apikeys (本番モード)→ **Create secret key**
2. 権限の選択で **Custom permissions** → 次の4つだけ設定(他は全部 None): **Checkout Sessions = Read**、**PaymentIntents = Read**、**Charges = Read**、**Refunds = Write**(admin.html の購入履歴と返金に必要)
3. 名前: `midimovie-license-live` → 作成
4. 表示された **`rk_live_…`** をコピー(一度しか出ません。チャットには貼らない)

## 5. 本番の Webhook

1. 🌐 https://dashboard.stripe.com/webhooks (本番モード)→ **Add destination**
2. Events from: **Your account**
3. イベント: `checkout.session.completed` と `checkout.session.async_payment_succeeded`
4. 種類: **Webhook endpoint** / URL: `https://midimovie-license.aratius.workers.dev/webhook`
5. 作成 → **Signing secret の Reveal** → **`whsec_…`** をコピー

## 6. Worker を本番の値に切り替える

1. 🖥 秘密情報を入れ替える(聞かれたら、コピーした値を貼る)
   ```
   cd ~/git/_Envs/_AI/MidiMovie
   wrangler secret put STRIPE_RAK --name midimovie-license
   wrangler secret put STRIPE_WEBHOOK_SECRET --name midimovie-license
   ```
2. 🖥 再デプロイ
   ```
   wrangler deploy tools/stripe-license-worker.js --name midimovie-license --compatibility-date 2026-10-01 --var ALLOW_ORIGIN:https://midimovie.aualrxse.com --var SITE:https://midimovie.aualrxse.com/
   ```
3. ✅ これ以降、**テストの購入ではキーが出ません**(本番のキーは本番の購入だけを確認するため)

## 7. サイトの設定を本番にする

1. 💬 Claude に次を伝える
   - 本番の Payment Link の URL
   - 公開する連絡先メール
   - 「`enforce` を `true` にして公開して」
2. (自分でやる場合)`license-config.js` を編集
   ```
   enforce: true,
   checkoutUrl: 'https://buy.stripe.com/(本番のURL)',
   contactEmail: 'あなたの公開用メール',
   ```
   → `git add -A && git commit -m "Go live" && git push`
3. 🌐 1〜2分待って https://midimovie.aualrxse.com/ を **強制リロード**(Mac: Cmd+Shift+R)

## 8. 本番の最終テスト(自分のカードで1回買って返金)

1. 🌐 サイトを開き、**Pro ボタン**(ヘッダー)→ 購入ボタン を押す
2. 自分のカードで購入(¥2,980 または $19)
3. ✅ `thanks.html` にキーと「Pro を有効にして開く」が出る
4. ✅ ボタンを押すと編集画面が開き、タブが **MidiMovie Pro**、ロゴ横に **PRO**、Pro ボタンが **Pro ✓** になる
5. ✅ サンプラー・MP4 書き出しなど有料機能が使える
6. 🌐 https://dashboard.stripe.com/payments → 今の支払いを開く → **返金(Refund)** → 全額
7. 🖥 (任意)返金したキーを無効にする: `thanks.html` のキーの 2 ブロック目(`MMF1.` の次)を base64 デコードすると `"i":"xxxxxxxx"` が見える → `license-config.js` の `revoked: ['xxxxxxxx']` に入れて push

## 9. 公開後の確認

- [ ] 🌐 Stripe の Webhook 画面で、イベントの送信が **200** になっている
- [ ] 🌐 Cloudflare → Workers → midimovie-license → ログに赤いエラーがない
- [ ] テスト購入で発行したキー(あれば)を `revoked` に入れた
- [ ] 友達に送るキーは `node tools/license-keys.mjs issue "名前"` で発行(動作確認済み)

## 困ったら(戻し方)

- **全員の制限を外す**: `license-config.js` を `enforce:false` に戻して push(誰でも全機能が使える状態に戻る)
- **購入ボタンが 404 / 無効**: Payment Link が本番モードか、URL に `test_` が入っていないか確認
- **thanks ページで「キーを取得できませんでした」**: Stripe の Webhook/Worker のログを見て、スクリーンショットを Claude に送る
- **返金してと言われた**: Stripe の支払い一覧から返金 → キーの id を `revoked` へ
