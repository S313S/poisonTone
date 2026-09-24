# 部署与 HTTPS 测试

## 普通 Node

安装 Node 20.9+，执行 `npm ci`、`npm run build`、`npm run start`。`npm run start` 启动 standalone Node 服务；可用 `PORT` 和 `HOSTNAME` 指定监听地址。在运行环境中设置 `.env.example` 中的变量。生产服务需要在反向代理处提供 HTTPS，并转发到应用的 3000 端口。`APP_ORIGIN` 填完整的 HTTPS 站点源，例如 `https://your-domain.example`，用于浏览器 API 请求来源核对。

## Docker

执行 `docker build -t scene-roast .`，再用安全的运行环境注入变量启动容器。不要把 `.env.local` 或密钥打进镜像。反向代理应限制请求体（建议 3MB）、按真实客户端地址限流，并禁止访问日志记录查询串及请求体。浏览器定位和剪贴板需要 HTTPS 安全上下文。

## 手机扫码

部署到具备合法使用条件的 HTTPS 测试域名后，把完整 URL 生成二维码，用目标手机和目标网络访问；逐项填写 [真机记录](mobile-test.md)。普通 `http://192.168...` 局域网地址不能用于自动定位的可靠验收。

当前工程未绑定托管服务。公开发布前先确认目标平台能运行 Node 服务端、设置私密环境变量、接收图片上传并提供 HTTPS；再核实主体、域名与相关上线要求。不要把测试部署当成已完成公开发布。
