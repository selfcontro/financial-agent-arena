# 模型 API 配置与调用

## 使用方式

1. 运行 `npm run dev`，在“添加模型”或已有卡片的“API 配置”中填写显示名称、Base URL、Model Name 和 API Key。
2. Base URL 填写供应商的 API 根路径（包含所需版本路径，例如 `https://provider.example/v1`），服务会追加 `/chat/completions`；也支持直接填写完整 Chat Completions 地址。示例域名仅作格式说明。
3. 点击“生成回答”，核对当前题目和目标地址，再点击“发送请求”。保存配置本身不调用供应商。
4. 查看生成结果后点击“保存为新回答”。旧回答和旧评分保留，新版待人工评审。

支持 [OpenAI Chat Completions 兼容协议](https://developers.openai.com/api/reference/resources/chat)：非流式 POST，发送 `model` 和 `messages`，读取 `choices[0].message.content`。不支持 Responses API、Anthropic 原生协议或直接调用问财网页。模型显示名称与供应商实际模型 ID 分开配置。

## 本地路由

- `PUT /api/connections/:id`：保存会话级连接配置。
- `GET /api/connections/:id`：返回地址、模型名及是否设置密钥，不返回密钥。
- `POST /api/generate`：根据保存配置转发请求。要求页面地址及模型名与服务配置一致，避免导入数据后使用旧路由。

前端请求同源本地服务，由服务端调用供应商，避免浏览器跨域与前端打包泄露密钥。API Key 只保留在本地服务内存，浏览器刷新不丢失，服务重启或开发配置重载后需重新填写；不进入评测数据、审计、备份或 Git。

变更地址或模型时不会沿用旧密钥；地址不允许嵌入用户名、密码、查询参数或片段，防止密钥进入非敏感配置。无鉴权本地接口允许密钥为空。服务仅绑定回环地址，用于本地单用户运行，不作为公共 API 部署。

## 输入与结果

发送问题、截止时间和截止前证据，不发送参考答案、参考数字、评审记录或未来证据。超时为 60 秒，不自动重试，避免重复计费。供应商的认证、额度错误以 HTTP 状态提示，不透传可能含密钥的错误正文。

保存结果使用 `simulated:false` 并附带当时的 `base_url`、`model_name` 快照。引用文字保留在原始回答中，结构化 `citations` 暂为空，需人工核对补录，不把全部输入证据伪装为模型实际引用。数据集仍以模拟题为基础，不调用 API 也能运行。

## 运行与验证

开发：`npm run dev` 同时提供界面和 API。

生产本地运行：`npm run build` 后执行 `npm start`，默认 5173 端口；可用 `ARENA_PORT=5175 npm start` 指定端口。`npm run preview` 只预览静态界面，没有 API，请使用 `npm start` 验证调用。

已通过本地测试接口进行浏览器端到端验证：配置、发送请求、生成预览、保存、刷新恢复。使用的是专门的测试模型，无真实供应商密钥或额度消耗。供应商真实可用性取决于用户配置，尚未实测。
