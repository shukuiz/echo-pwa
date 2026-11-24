# zhisong.woff2 · 霞鹜新致宋（子集）

- 来源：LXGW Neo ZhiSong / 霞鹜新致宋 v1.071，https://github.com/lxgw/LxgwNeoZhiSong
- 本文件是它的**衍生程序（子集）**：只保留 GB2312 汉字、ASCII、常用中文标点和颜文字符号，转成 WOFF2，未改动任何字形。
- 授权：**IPA Font License Agreement v1.0**（全文见同目录 `LICENSE-IPA-1.0.md`，或 https://opensource.org/licenses/IPA ）。
  本字体衍生自 IPA 字体「IPAex明朝」「IPAmj明朝」，与 SIL OFL 1.1 不兼容；衍生字体继续按 IPA Font License 1.0 授权。
- 只在「美化 → 字体」选了霞鹜新致宋时才会下载。

## 换回 IPA 原始字体（IPA Font License 第 3 条第 1 款第 2 项）

1. 从 https://moji.or.jp/ipafont/ipafontdownload/ 下载并在本机安装原始字体「IPAex明朝」（或从 https://moji.or.jp/mojikiban/font/ 下载「IPAmj明朝」）。
2. 在 echo 里打开「美化 → 字体」，选「霞鹜新致宋」后打开「改用本机 IPA 原始字体」开关，页面就会改用本机安装的原始字体，不再使用本文件。
3. 或者直接用 `IPAexMincho.ttf` 替换部署目录里的 `public/fonts/zhisong.woff2`（WOFF2/TTF 都可以，需同步改 `app/beauty.css` 里 `@font-face` 的 `format`）。
