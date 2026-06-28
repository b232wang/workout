# health-ingest backend

接收 iPhone(HealthRelay app)推来的 Apple Health 数据(**workout / 指标 quantity / 睡眠**),存进 SQLite,供 Mac 拉取。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET  | `/healthz` | 无 | 存活探针,返回 `{"ok":true}` |
| POST | `/ingest` | Bearer | 推送 export envelope(批量,按 `uuid` 去重) |
| GET  | `/workouts?since=<ISO>` | Bearer | 拉 workout;`since` 按 `received_at` 增量 |
| GET  | `/quantity-samples?since=<ISO>&type=<type>` | Bearer | 拉指标;可按 `type`(如 `heartRate`)过滤 |
| GET  | `/sleep?since=<ISO>` | Bearer | 拉睡眠 |

### POST /ingest 请求体(envelope)

```json
{
  "exportedAt": "2026-06-28T04:30:00Z",
  "device": "iPhone15,2",
  "appVersion": "1.0.0",
  "data": {
    "workouts": [
      { "uuid": "…", "activityType": "walking", "startDate": "…", "endDate": "…",
        "durationSec": 2700, "distanceM": 3200, "energyKcal": 180, "source": "Apple Watch" }
    ],
    "quantitySamples": [
      { "uuid": "…", "type": "heartRate", "startDate": "…", "endDate": "…",
        "value": 72, "unit": "count/min", "source": "Apple Watch" }
    ],
    "sleepSamples": [
      { "uuid": "…", "startDate": "…", "endDate": "…", "stage": "asleepCore", "source": "Apple Watch" }
    ]
  }
}
```

- `data` 下三个分组**都可选**(app 可能只发其中一类),但至少要有一条样本。
- 必填字段:所有类型 `uuid` / `startDate` / `endDate`;workout 还需 `activityType`;quantity 还需 `type` / `value` / `unit`;sleep 还需 `stage`。其余可选。
- `uuid` = HealthKit 样本 UUID,据此去重(重发自动忽略)。
- 响应:`{ "ok": true, "inserted": {workouts,quantitySamples,sleepSamples}, "skipped": {…} }`。

> 格式即 HealthRelay 设计 spec §7(`~/side-project/healthrelay/docs/superpowers/specs/2026-06-28-healthrelay-design.md`)。两边以该 spec 为准。

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
  -d '{"data":{"workouts":[{"uuid":"test-1","activityType":"walking","startDate":"2026-06-28T10:00:00Z","endDate":"2026-06-28T10:45:00Z","durationSec":2700,"distanceM":3200,"energyKcal":180,"source":"manual"}],"quantitySamples":[{"uuid":"hr-1","type":"heartRate","startDate":"2026-06-28T10:00:00Z","endDate":"2026-06-28T10:00:00Z","value":72,"unit":"count/min"}]}}'

curl "$BASE/workouts" -H "Authorization: Bearer $TOKEN"
curl "$BASE/quantity-samples?type=heartRate" -H "Authorization: Bearer $TOKEN"
```

第二次 POST 同样 `uuid` 应返回 `inserted` 全 0、`skipped` 对应 +1(去重生效)。
