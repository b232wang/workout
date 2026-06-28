# health-ingest (Phase 1 backend)

接收 iPhone 推来的 Apple Health 运动数据,存进 SQLite,供 Mac 拉取。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET  | `/healthz` | 无 | 存活探针,返回 `{"ok":true}` |
| POST | `/ingest` | Bearer token | iPhone 推送 workout(批量,按 `uuid` 去重) |
| GET  | `/workouts?since=<ISO>` | Bearer token | Mac 拉取;`since` 按 `received_at` 过滤(增量) |

### POST /ingest 请求体

```json
{
  "workouts": [
    {
      "uuid": "EFE2...必填,HealthKit 样本 UUID",
      "activityType": "walking",
      "startDate": "2026-06-28T10:00:00Z",
      "endDate":   "2026-06-28T10:45:00Z",
      "durationSec": 2700,
      "distanceM": 3200,
      "energyKcal": 180,
      "source": "Apple Watch"
    }
  ]
}
```

必填:`uuid`、`activityType`、`startDate`、`endDate`。其余可选。
响应:`{ "ok": true, "inserted": N, "skipped": M }`(`skipped` = 重复被忽略的数量)。

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `API_TOKEN` | (必填) | Bearer token,≥16 字符,缺失/过短直接启动失败 |
| `PORT` | `8080` | 监听端口 |
| `DB_PATH` | `/data/health.db` | SQLite 文件路径 |

生成 token:`openssl rand -hex 32`

## 本地跑 / 测试

```bash
cd health-sync/backend
npm install
npm test                       # 单元测试
API_TOKEN=$(openssl rand -hex 32) DB_PATH=./dev.db npm start
```

## 部署到 Synology(Container Manager)

> 前提:已装 Container Manager;NAS 公网可达;已有 DDNS 域名(如 `xxx.synology.me`)。

1. **拷贝目录上 NAS**:把 `health-sync/backend/` 整个传到 NAS,例如 `/volume1/docker/health-ingest/`。
2. **建 `.env`**(与 `docker-compose.yml` 同目录):
   ```
   API_TOKEN=<openssl rand -hex 32 生成的串>
   ```
3. **构建 & 启动**:Container Manager → 项目 → 新增 → 选该目录的 `docker-compose.yml` → 构建。
   - 若 DSM 版本不支持项目构建,SSH 进 NAS:`cd /volume1/docker/health-ingest && sudo docker compose up -d --build`
   - 注意:在 **NAS 上构建**(而非 Mac),让原生模块匹配 NAS 的 CPU 架构。
4. **TLS / 反向代理**(DSM 控制面板 → 登录门户 → 高级 → 反向代理):
   - 来源:`https://health.xxx.synology.me:443`
   - 目标:`http://localhost:8080`
   - 证书:控制面板 → 安全性 → 证书,给该域名签 Let's Encrypt 并指派给反代。
5. **防火墙**:只放行反代用的 443(或你自定义的 HTTPS 端口);**不要**把 8080 直接暴露公网。

## 验证(curl)

```bash
TOKEN=<你的 token>
BASE=https://health.xxx.synology.me

curl $BASE/healthz

curl -X POST $BASE/ingest \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"workouts":[{"uuid":"test-1","activityType":"walking","startDate":"2026-06-28T10:00:00Z","endDate":"2026-06-28T10:45:00Z","durationSec":2700,"distanceM":3200,"energyKcal":180,"source":"manual"}]}'

curl "$BASE/workouts" -H "Authorization: Bearer $TOKEN"
```

第二次 POST 同一 `uuid` 应返回 `inserted:0, skipped:1`(去重生效)。
