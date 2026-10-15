# 《人工智能通识》练习平台 · Render 固定部署傻瓜教程

目标：把本地代码推到 GitHub，再用 Render 一键部署，得到一个**永久固定**的公网地址（如 `https://ai.onrender.com`），7×24 在线。学生交卷成绩自动进后台，教师端可看全班成绩并按班级导出。

> 你只需要在自己电脑上**点几下鼠标**，全程不用写任何命令。

---

## 第 1 步：安装并登录 GitHub Desktop
1. 打开 https://desktop.github.com/ ，下载 Windows 版并安装。
2. 打开 GitHub Desktop，点 **Sign in to GitHub.com**，用你的账号（Gunan1234）登录。
   （走 OAuth 授权，不用记令牌、不用命令行。）

## 第 2 步：把本地代码推送到你的仓库
1. GitHub Desktop 菜单 **File → Add Local Repository…**
2. 点 **Choose…**，选中这个文件夹（练习平台所在目录）：
   ```
   D:\workbuddy成果\课堂测验平台
   ```
3. 点 **Add Repository**。GitHub Desktop 会识别出这是一个已有的 git 仓库。
4. 窗口上方会出现 **Push origin**（首次也可能显示 **Publish repository**），点它。
   - 若提示登录/授权，用 GitHub 账号确认即可。
   - 仓库 `Gunan1234/ai` 是空的，会直接把代码推上去。
5. 等几十秒推送完成。然后去 https://github.com/Gunan1234/ai 刷新，应能看到这些文件：
   `server.js`、`package.json`、`render.yaml`、`public/`、`data/questions.json`

> ⚠️ 成绩文件 `results.json` **不会**被推送（已在 `.gitignore` 排除，保护学生隐私），部署后由服务器自动生成，不必担心。

## 第 3 步：在 Render 上关联部署，拿到固定地址
1. 打开 https://render.com/ ，点 **Get Started / Sign Up**，建议直接选 **Sign up with GitHub**（用同一 GitHub 账号登录，省去授权麻烦）。
2. 进入 Dashboard，点右上角 **New → Blueprint**（**一定要选 Blueprint**，它才会自动读取仓库里的 `render.yaml`）。
3. 连接 GitHub：首次会让你授权 Render 访问 GitHub（点 **Authorize / Install**，允许访问 `Gunan1234/ai`）。
4. 仓库列表里选 **ai**（即 Gunan1234/ai）。
5. Render 自动读取 `render.yaml`，显示要部署的服务，点 **Apply / Deploy**。
6. 等待 **2–5 分钟**（首次构建较慢）。状态变绿（Live）后，点服务名进入，找到 **URL**，形如：
   ```
   https://ai.onrender.com
   ```
   这就是你的**永久固定地址**，不会再变。

## 第 4 步：验证
1. 打开 `https://ai.onrender.com` → 选"学生" → 填姓名班级 → 做题 → 提交，成绩应进后台。
2. 教师端：`https://ai.onrender.com/?token=teacher7400&role=teacher` → 可看全班成绩、按班级导出 CSV/Excel。
   （首次打开可能慢 30–60 秒，因为免费版空闲后会自动休眠、醒来需要一点时间，属正常。）

---

## 常见问题
- **GitHub Desktop 推不上去 / 认证失败？**
  确保在 GitHub Desktop 里已登录你的 GitHub 账号；仍失败的话，去 GitHub 网页 → Settings → Developer settings → Personal access tokens 生成一个 token，在 GitHub Desktop 的密码框里填这个 token 登录。
- **Render 部署后打开空白 / 题目为空？**
  一般不会（题库 `questions.json` 已随代码推送）。若空白，多半是构建失败，去 Render 服务的 **Logs** 页看报错。
- **免费版够用吗？**
  够。免费 plan 每月 750 小时，单人教学远用不完；唯一缺点是空闲后会休眠、首次访问稍慢。

## 当前临时链接（过渡用，拿到固定地址前先用这个）
`https://attendance-mounting-confidential-leeds.trycloudflare.com`（已验证可访问；教师端访问码 `teacher7400`）
注意：这是临时隧道，本会话结束会失效、重启会换地址。固定地址拿到后请统一改用固定地址，并通知学生。
