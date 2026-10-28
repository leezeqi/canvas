---
title: 上游同步
description: 二改仓库持续吸收上游更新并保留本项目改动的方法与同步记录
---

# 上游同步

本项目基于 [tigerowo/infinite-canvas](https://github.com/tigerowo/infinite-canvas) 二次开发。目标是保留本项目改动，同时持续吸收上游更新，出问题时可以回滚。

## 一、上游关系

- 上游仓库：`https://github.com/tigerowo/infinite-canvas.git`，本地远程名 `upstream`，同步 `upstream/main`。
- 本地早期历史来自 [basketikun/infinite-canvas](https://github.com/basketikun/infinite-canvas)。`8e8a99b` 把代码整体替换为 tigerowo 的 `f30b8d7`，两者文件完全一致，但 tigerowo 与本地历史没有共同祖先。
- `eb166e2` 用 `-s ours` 合并把 `f30b8d7` 登记为祖先，不改任何文件。此后两边以 `f30b8d7` 为共同祖先，可以直接普通合并，不需要重建历史或强推。
- 不要再按 basketikun 同步：它和当前代码不是同一条代码线，合并会产生大量无意义冲突。

## 二、完成标准

一次同步满足以下条件才算完成：

1. 本地 `main` 包含指定的上游提交，二改功能仍然存在。
2. 没有遗留冲突标记，也没有引用已删除渠道（APIMart、88API、KIE、AutoDL）的代码。
3. 后端测试和前端构建通过（由维护者执行）。
4. 推送后 `git ls-remote origin refs/heads/main` 返回本地目标提交哈希。
5. 工作区干净，同步前的备份引用保留到验证完成。

`git push` 输出 `Everything up-to-date` 不能单独证明推送成功；出现 `RPC failed`、`curl 55` 或连接中断后，以远程哈希为准。

## 三、日常同步步骤

### 1. 冻结并备份

```powershell
git switch main
git status --short --branch
git tag backup/canvas-before-upstream-<上游版本>-<日期>
git branch -f legacy-main main
```

工作区不干净时先处理未提交内容。备份标签在远程验证完成前不要删除。

### 2. 拉取上游并记录基线

```powershell
git fetch upstream --prune
git log --oneline --decorate -n 10 upstream/main
git merge-base main upstream/main
git rev-list --count main..upstream/main
```

记录本次上游基线提交、版本号和吸收的提交数。Windows 下 TLS 握手失败时，只对当前命令加 `-c http.sslBackend=openssl -c http.version=HTTP/1.1`。

### 3. 先试合并再动工作区

```powershell
git merge-tree --write-tree --name-only main upstream/main
```

输出的冲突文件清单用于预估工作量，这一步不改动工作区和分支。

### 4. 合并并解决冲突

```powershell
git merge --no-ff --no-commit upstream/main
```

冲突处理原则：

- 上游的通用修复和新功能优先保留，本项目二改逐项确认保留。
- 已删除的 APIMart、88API、KIE、AutoDL 保持删除；上游对这些文件的修改（modify/delete 冲突）直接 `git rm`，上游新代码里引用这些渠道的分支一并去掉。
- 本地删渠道时顺带删掉的通用钩子，如果上游新功能还在用就补回来，例如 `videoError`、`readCreatedImageURLs`、`pollURL`、`collectHTTPURLs`。
- 用户端已改为左侧栏 + Agent 对话首页：`app-top-nav.tsx`、`mobile-nav-drawer.tsx`、`home-banner-carousel.tsx`、`home-recent-projects.tsx`、`components/home/infinite-canvas-svg-background.tsx` 保持删除（modify/delete 冲突直接 `git rm`）；`web/src/app/(user)/page.tsx`、`(user)/layout.tsx`、`constant/navigation-tools.ts` 以本地版本为准，上游对导航或首页新增的入口手动并入 `navigationTools` 或侧栏。`app-config-modal.tsx` 合并时保留本地加的 `section` 参数、`active`/`show`/`Shell` 和各分组的显示条件（设置页依赖它们），上游在弹窗里新增的配置项按所属分组包进对应的 `show(...)` 条件。
- 上游函数签名变化（例如新增 `context`、`signal` 参数，积分改为 `float64`）要同步到本地新增文件的调用处。
- 合并后扫描两类问题：前端 import 指向不存在的文件或导出；Go 代码调用已不存在的函数。

### 5. 验证并提交

```powershell
go test ./...
cd web; pnpm install --frozen-lockfile; pnpm build; cd ..
git status --short
git commit
```

提交标题和正文使用简体中文，写明上游版本、基线提交和保留的二改范围。测试或构建失败时不要推送。

### 6. 推送并验证

```powershell
$old = git ls-remote origin refs/heads/main
git push origin main
git ls-remote origin refs/heads/main
```

桥接合并之后历史只会追加，正常推送即可，不需要 `--force`。远程哈希不是本地目标哈希时，继续排查，不要强推覆盖。

## 四、故障判断速查

| 现象 | 判断 | 处理 |
| --- | --- | --- |
| `refusing to merge unrelated histories` | 上游与本地没有共同祖先 | 确认桥接提交 `eb166e2` 在 `main` 中；只有首次登记基线时才使用 `--allow-unrelated-histories` |
| 冲突文件数异常多 | 可能合错了上游（例如 basketikun） | 停止合并，执行 `git merge --abort`，核对 `upstream` 地址 |
| TLS/Schannel 握手失败 | Windows TLS 或网络瞬时失败 | 当前命令加 `http.sslBackend=openssl` 和 `http.version=HTTP/1.1` |
| `RPC failed; curl 55` 后显示 `Everything up-to-date` | 结果未知 | 立即执行 `git ls-remote` |
| 推送被拒绝（non-fast-forward） | 远程出现新提交 | 先拉取合并远程提交，不能强推 |

## 五、备份与回滚

每次同步至少保留同步前的 `backup/...` 标签、`legacy-main` 分支、上游基线哈希和最终提交哈希。回滚只把本地分支或远程引用移回已确认的备份提交，不删除对象，不覆盖未知的远程新提交。

```powershell
git switch main
git reset --hard backup/canvas-before-upstream-<上游版本>-<日期>
```

## 六、同步记录

### 2026-10-28：v0.7.1 → v0.8.2

- 上游：tigerowo/infinite-canvas `main`，最新提交 `e13006fbaeabe14e4a6d27cba667ff1473009ebc`（v0.8.2 标签 `801e056` 之后又有 1 个提交）；相对基线 `f30b8d7f8a01573d0332c98f214f4bf4d1e3de14` 吸收 14 个提交。
- 同步前 `main`：`4885a55a1c5835322a91a2086b56f50040175419`；回滚标签 `backup/canvas-before-upstream-v0.8.2-20261028`，并建立 `legacy-main` 分支。
- 首次建立可同步历史：确认 `8e8a99b` 与上游 `f30b8d7` 文件完全一致后，用 `git merge -s ours --allow-unrelated-histories f30b8d7` 生成桥接提交 `eb166e2`，不改文件。
- 合并处理 46 个冲突文件，其中 3 个为 modify/delete（KIE/APIMart/Kling 相关文件，保持删除）。
- 保留的二改：Sub2API Grok 视频（含轮询退避与内容下载）、Canvas OpenAPI 视频渠道、即梦和 MiniMax 海螺渠道、OpenAI 渠道图生图 JSON 格式、Seedream 图生图修复、APIMart/88API/KIE/AutoDL 删除、极光玻璃视觉、第三方平台屏蔽。
- 吸收的上游功能：RunningHub/ComfyUI 工作流渠道、ComfyUI Bridge、渠道自定传参转译、模型分类、停止生成与重试、节点再生成方式、局部重绘、批量下载、TokenDance 渠道等。
- 适配：上游把 MiniMax 协议 ID 从 `metaso` 改为 `minimax`，本地代码和测试同步改名，已保存的 `metaso` 渠道不再被识别为 MiniMax（项目未上线，不做旧数据兼容）；TokenDance 依赖的视频错误钩子、直连轮询地址、创建即返回图片地址和 URL 收集函数已补回；TokenDance 和 MiniMax 按第三方平台屏蔽规则在协议下拉中隐藏；`sub2api_video.go` 适配 `SelectModelChannelForModel` 新签名。
- 同步后追加：删除上游写死的站点公告横幅 `web/src/components/layout/announcement-banner.tsx`（TokenDance 推广、RunningHub 公告、上游微信群链接）及顶部导航和 404 页的引用；以后同步遇到该文件的修改，按 modify/delete 冲突保持删除。
- 本次在本机未执行 `go test`、前端构建或依赖安装（本机无 Go，`web` 未安装依赖），仅做了冲突标记、import 路径和已删除符号的静态扫描。
