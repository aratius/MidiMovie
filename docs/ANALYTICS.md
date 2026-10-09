# アクセス解析(Google アナリティクス 4)

1. https://analytics.google.com/ → 管理 → プロパティを作成 → ウェブのデータストリーム → URL `https://midimovie.aualrxse.com`
2. 表示される **測定ID(G-XXXXXXXXXX)** を `license-config.js` の `window.MM_ANALYTICS = { gaId: 'G-XXXXXXXXXX' }` に入れて push
3. 同意バナー(Consent Mode)が出る。同意した人だけ Cookie を使う。映像・MIDI・キー・購入IDは送らない(URL の `?session_id=` と `#gift=` も送らない)
4. 送っているイベント: `project_new` / `export`(type: wav, midi, mp4) / `pro_modal`(feature) / `checkout_click` / `pro_activated` / `purchase`
5. GA 管理 → イベント → 重要なイベントとして `purchase` / `checkout_click` / `pro_activated` をオンにする

検索キーワードの流入は **Search Console** で見る(GA にもリンクできる)。
