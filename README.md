# YouTube Music 彻底告别土区 (探索页净化 + 排行榜自选固定地区)

针对跨区（如土耳其区）订阅 YouTube Premium 的用户，解决在网页端 `music.youtube.com` 中 **“探索 / 新发行”** 与 **“排行榜”** 被强制锁死显示土耳其歌曲的问题。

## ✨ 核心功能

1. **探索 / 新发行页面自动去土区 (`FEmusic_explore` / `FEmusic_new_releases`)**
   - 保持 YouTube Premium 账号正常登录状态；
   - 自动拦截公共“探索/新发行”接口请求并剥离土区账单凭证，让 Google 服务器按你当前的代理节点 IP（如美国、香港、日本）返回对应地区的新专辑与热门单曲；
   - 支持从侧边栏切换进入，也支持直接在 `/explore` 页面按 `F5` 刷新时原地热替换数据。

2. **排行榜页面新增 `📌 固定地区` 胶囊选择器 (`/charts`)**
   - 在原国家下拉按钮右侧新增原生磨砂胶囊风格的 **`📌 固定地区: XX ▾`** 按钮；
   - 动态读取官方排行榜表单全部 70 个国家/地区，常用地区（香港、美国、全球、日本、韩国、英国、新加坡、加拿大）置顶，并支持关键字搜索；
   - 选中后自动持久化保存在 `localStorage`，每次进入排行榜页面时无需弹出下拉菜单，直接调用 Polymer 内部 `yt-action` 接口零闪烁静默切换。

## 📦 一键安装

确保浏览器已安装 **Tampermonkey (油猴)** 扩展，点击下方链接即可一键安装：

👉 **[点此一键安装脚本 (ytm-region-switcher.user.js)](https://raw.githubusercontent.com/kk-cao/ytm-region-switcher/main/ytm-region-switcher.user.js)**
