# Procedure Editor

PC操作手順書を作成するための静的Webアプリです。サーバー不要で、`index.html` をブラウザで開くだけで動作します。

## 使い方

1. `index.html` をブラウザで開きます。
2. 表紙情報、STEP、説明ブロックを入力します。
3. スクリーンショットはファイル選択、ドラッグ&ドロップ、または `Ctrl+V` で貼り付けできます。
4. 必要に応じて画像に `○`、矢印、番号、マーカーの注釈を追加します。
5. JSON保存、Markdown保存、PDF/印刷、閲覧HTML出力を実行します。

## 主な機能

- 表紙情報入力
- STEP追加、削除、並び替え
- 説明ブロック追加、削除、並び替え
- 3カラム編集UI
- スクリーンショット貼付
- 画像注釈の追加、移動、サイズ変更
- 説明ブロックの帰属STEP移動
- Markdown出力
- JSON保存、JSON読込
- 未保存警告
- PDF/印刷
- 閲覧用単一HTML出力

## ファイル構成

```text
procedure-editor/
├─ index.html
├─ README.md
├─ src/
│  ├─ css/
│  │  └─ style.css
│  └─ js/
│     ├─ app.js
│     ├─ state.js
│     ├─ render.js
│     ├─ blocks.js
│     ├─ annotations.js
│     ├─ export.js
│     ├─ viewerExport.js
│     └─ utils.js
└─ sample/
   └─ sample.json
```

## 保存形式

JSON保存時のファイル名は次の形式です。

```text
手順書名_YYYYMMDD_HHMMSS.json
```

閲覧用HTMLは単一HTMLファイルとして出力され、画像はbase64で埋め込まれます。
