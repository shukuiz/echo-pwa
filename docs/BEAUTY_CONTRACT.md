# Echo 聊天美化契约 ✿

一份美化就是一段 CSS。下面这些名字会一直留着，照着写就可以。

## 在哪儿生效

只在聊天页 `/chat` 生效。换窗、窗口列表、设置和美化页面都不会载入这段样式。写坏了，去「美化 → 聊天美化 → 停用」就能恢复。停用会清空当前样式，保存过的本机预设都还在。

把样式粘进编辑框，或导入一份不超过 200 KB 的 `.css` 文件，再点「应用」。想留一份随时换回来，就点「保存为预设」。预设保存的是上一次点「应用」的内容。样式存在这台设备的浏览器里。

## 可以改哪些地方

| 名字 | 是什么 | 什么时候出现 |
| --- | --- | --- |
| `.ec-page` | 整个聊天页，带 `data-echo-page="chat"` | 打开聊天页时 |
| `.ec-nav` | 顶栏，包含屏幕顶部留白 | 一直在 |
| `.ec-nav-title` | 顶栏的标题 | 一直在 |
| `.ec-nav-btn` | 返回和换窗按钮 | 一直在 |
| `.ec-list` | 上下滚动的消息区 | 一直在 |
| `.ec-msg` | 一条消息。用 `data-who="me"` 找自己的消息，用 `data-who="ai"` 找 echo 的。用 `data-status` 区分正在生成 `streaming`、完成 `done`、出错 `error`、已停止 `stopped` | 有聊天记录时 |
| `.ec-avatar` | echo 的头像 | echo 显示头像时 |
| `.ec-bubbles` | 装气泡的一层 | 有气泡时，单个气泡也有这一层 |
| `.ec-bubble` | 单个气泡，也带 `data-who="me"` 或 `data-who="ai"` | 有气泡时 |
| `.ec-think` | 思考区，包含展开按钮和正文 | 模型给了思考内容时 |
| `.ec-time` | 时间和朗读按钮所在的那一行 | 消息显示时间时 |
| `.ec-image` | 消息中的图片缩略图 | 消息带图时 |
| `.ec-file` | 消息中的文件块 | 消息带文件时 |
| `.ec-error` | 回复出错的提示卡 | 有错误时 |
| `.ec-empty` | 「和 echo 说点什么吧」 | 没有消息时 |
| `.ec-composer` | 底部输入区 | 可以输入消息时 |
| `.ec-input` | 打字的输入框 | 输入区显示时 |
| `.ec-btn` | 附件、麦克风、模型按钮 | 输入区显示时 |
| `.ec-send` | 发送或停止按钮。可用 `data-state="send"` 或 `data-state="stop"` 单独选 | 输入区显示时 |

## 可以调哪些数值

把变量写在 `.ec-page` 里会影响聊天页，写在一个气泡上就只影响那个气泡。

| 变量 | 管什么 | 默认值 |
| --- | --- | --- |
| `--ec-bubble-r` | 气泡圆角 | 玻璃 22px，仿真 24px |
| `--ec-bubble-px` | 气泡左右内距 | 16px |
| `--ec-bubble-py` | 气泡上下内距 | 10px |
| `--ec-bubble-fs` | 气泡字号 | 15px |
| `--ec-bubble-lh` | 气泡行高 | 22px |
| `--ec-bubble-gap` | 相邻两条消息之间的距离 | 12px（含下一条消息顶部留白） |
| `--ec-bubble-gap-in` | 同一条消息分成几个气泡时的距离 | 6px |
| `--ec-avatar-size` | 头像宽高 | 32px |
| `--ec-avatar-r` | 头像圆角，直接填数字，例如 `8` | 9999（圆形） |
| `--ec-ink` | 气泡和输入框的文字颜色 | 跟随当前字色 `--g-ink` |
| `--ec-mute` | 输入提示和顶栏开关的次要文字颜色 | 跟随当前次要字色 `--g-mute` |
| `--ec-accent` | 头像图案和可点的发送按钮颜色 | 跟随重点色 `--hl` |

## 它们是怎么套在一起的

图中略过了几层排版。写 CSS 时，用空格找里面的元素即可。

```text
.ec-page
  .ec-nav
    .ec-nav-title
    .ec-nav-btn
  .ec-list
    .ec-msg
      .ec-avatar
      .ec-bubbles
        .ec-bubble
    .ec-empty
  .ec-composer
    .ec-input
    .ec-btn
    .ec-send
```

## 五段可以直接抄的 CSS

### 1. 改圆角和配色

气泡的玻璃底由 CSS 绘制，液态玻璃和仿真都可以给 echo 的气泡换底色。想给自己的气泡换底色时，先在「美化 → 颜色 → 我方气泡」选「全玻璃」，再把示例里的 `"ai"` 改成 `"me"`。

```css
.ec-page {
  --ec-bubble-r: 16px;
  --ec-accent: #89528d;
}

html .ec-page[data-echo-page="chat"] .ec-list .ec-bubble[data-who="ai"] {
  --ec-ink: #432748;
  background: rgb(250 229 249 / 88%);
}
```

### 2. 隐藏头像

```css
.ec-page .ec-avatar {
  display: none;
}
```

### 3. 把字放大，行距放宽

```css
.ec-page {
  --ec-bubble-fs: 17px;
  --ec-bubble-lh: 27px;
  --ec-bubble-gap-in: 8px;
}
```

### 4. 只改我的气泡

```css
.ec-page .ec-bubble[data-who="me"] {
  --ec-bubble-r: 12px;
  --ec-ink: #59394e;
  --ec-bubble-px: 20px;
}
```

### 5. 给相邻消息加一条分隔线

```css
.ec-page .ec-msg + .ec-msg {
  border-top: 1px solid rgb(145 108 136 / 22%);
}
```

## 常见写错

- 用了 `.bub` 或 `.msgrow`。这些名字可能变，写 `.ec-bubble` 和 `.ec-msg` 就能放心用。
- 把别的网页的 `body` 或 `*` 规则整段搬过来。先把选择范围缩到 `.ec-page` 下面，免得连聊天按钮也改了。
- 写成 `.ec-msg > .ec-bubbles`。中间还有排版层，用 `.ec-msg .ec-bubbles` 就能选中。
- 把头像圆角写成 `--ec-avatar-r: 8px`。这个变量直接写 `8`。
- 想保留玻璃的半透明感，却用了完全不透明的底色。可以像例子那样给颜色加透明度。
- 用 `::after` 画装饰，挡住了已有的动效或标记。简单的线条和装饰可以先试试边框和阴影。

## 三条规矩

1. 省下 `!important`。先用表里的变量，或把选择器写得更具体。
2. 图片用 `data:` 或公网地址，这样浏览器才读得到。
3. 给装饰用的伪元素加 `pointer-events: none`，聊天按钮才照样点得动。
