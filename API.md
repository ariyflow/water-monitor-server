# 水质监测服务 API 说明

水质监测服务后端（Flask），默认监听 `0.0.0.0:15382`，按模块组织接口。

## 通用约定

- **Base URL**：`http://<host>:15382`（`<host>` 为部署主机，本机可用 `localhost`）。
- **数据格式**：请求/响应均为 JSON；请求头 `Content-Type: application/json`。
- **认证**：基于 Cookie 的 Flask Session。「设备分配序列号」（`POST /api/devices`）与「设备上报数据」（`POST /api/sensors`）为设备驱动接口，无需登录；其余接口要求登录。
  - 用 `curl` 时先登录并保存 Cookie：`-c cookie.txt`，后续请求携带 `-b cookie.txt`。
  - 未登录访问受保护接口返回 `401 {"error": "Authentication required"}`。
- **错误格式**：统一返回 `{"error": "<说明信息>"}`，配合相应 HTTP 状态码。
- **时间戳格式**：`YYYY-MM-DD HH:MM:SS`（本地系统时间）。

---

## 1. 认证模块（Auth）

### `POST /api/auth/register`
- **认证**：不需要。
- **说明**：注册新用户。用户名在 `users` 表中唯一，不可重复；密码以 SHA256 哈希存储，不存明文。
- **请求体（JSON）**：
  | 字段 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | `username` | string | 是 | 用户名（去首尾空格，唯一） |
  | `password` | string | 是 | 密码，至少 6 位 |

- **成功响应**（`201`）：
  ```json
  {"data": {"id": 3, "username": "yw", "created_at": "2026-09-01 16:21:54"}}
  ```
- **错误**：
  - `400` `{"error": "用户名不能为空"}`
  - `400` `{"error": "密码不能为空"}`
  - `400` `{"error": "密码至少需要 6 位"}`
  - `409` `{"error": "用户名已存在"}`

### `POST /api/auth/login`
- **认证**：不需要。
- **说明**：登录，成功后写入会话。
- **请求体（JSON）**：
  | 字段 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | `username` | string | 是 | 用户名 |
  | `password` | string | 是 | 密码 |

- **成功响应**（`200`）：
  ```json
  {"data": {"id": 3, "username": "yw", "created_at": "2026-09-01 16:21:54"}}
  ```
- **错误**：`401` `{"error": "用户名或密码错误"}`

### `POST /api/auth/logout`
- **认证**：需要。
- **说明**：退出登录，清除会话。
- **成功响应**（`200`）：
  ```json
  {"message": "已退出登录"}
  ```

### `GET /api/auth/me`
- **认证**：不需要（可根据会话返回结果）。
- **说明**：返回当前登录用户。
- **成功响应**（`200`）：
  - 已登录：
    ```json
    {"data": {"id": 3, "username": "yw", "created_at": "2026-09-01 16:21:54"}}
    ```
  - 未登录：`{"data": null}`

### `GET /login`
- **认证**：不需要。
- **说明**：渲染登录/注册页面（`login.html`）。已登录则重定向到 `/`。

---

## 2. 设备模块（Devices）

设备序列号为 **6 字节随机值**，以 12 位十六进制字符串表示。由绑定用户获得，设备保存后凭该序列号上报数据。

### `POST /api/devices`
- **认证**：**不需要**（设备/调用方可自动请求分配序列号）。
- **说明**：生成序列号并绑定设备到指定用户名（该用户需已注册）。
- **请求体（JSON）**：
  | 字段 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | `username` | string | 是 | 要绑定设备的目标用户名 |
  | `name` | string | 否 | 设备备注/名称 |

- **成功响应**（`201`）：
  ```json
  {"data": {"id": 2, "serial": "e7980eab5386", "name": "河边一号", "user_id": 3, "username": "yw", "created_at": "2026-09-01 16:33:51"}}
  ```
- **错误**：
  - `400` `{"error": "Field 'username' is required"}`
  - `404` `{"error": "用户不存在"}`

### `GET /api/devices`
- **认证**：需要。
- **说明**：列出设备。默认返回当前登录用户的设备；可用 `?username=` 查询指定用户。
- **查询参数**：`username`（可选）。
- **成功响应**（`200`）：
  ```json
  {"data": [{"id": 2, "serial": "e7980eab5386", "name": "河边一号", "user_id": 3, "created_at": "2026-09-01 16:33:51"}]}
  ```
- **错误**：
  - `401` 未登录
  - `404` `{"error": "用户不存在"}`（指定的 `username` 不存在）

### `GET /api/devices/<serial>`
- **认证**：需要。
- **说明**：按序列号查询单个设备。
- **路径参数**：`serial`（设备序列号）。
- **成功响应**（`200`）：
  ```json
  {"data": {"id": 2, "serial": "e7980eab5386", "name": "河边一号", "user_id": 3, "created_at": "2026-09-01 16:33:51"}}
  ```
- **错误**：
  - `401` 未登录
  - `404` `{"error": "设备不存在"}`

---

## 3. 传感器数据模块（Sensors）

### `GET /api/sensors`
- **认证**：需要。
- **说明**：分页读取**当前登录用户设备**的读数，按最新在前排序（只返回属于该用户设备的数据）。
- **查询参数**：
  | 参数 | 类型 | 默认值 | 说明 |
  |------|------|--------|------|
  | `limit` | int | 200 | 每页条数，最大 1000 |
  | `offset` | int | 0 | 偏移量 |

- **成功响应**（`200`）：
  ```json
  {
    "total": 1,
    "limit": 200,
    "offset": 0,
    "data": [
      {
        "id": 320, "device_id": 2, "serial": "e7980eab5386",
        "device_name": "河边一号", "ph": "7.2", "temperature": "19",
        "flow": "10", "turbidity": "", "conductivity": "",
        "created_at": "2026-09-01 16:33:51"
      }
    ]
  }
  ```
- **错误**：`401` 未登录

### `GET /api/sensors/<record_id>`
- **认证**：需要。
- **说明**：按 id 获取单条读数。
- **路径参数**：`record_id`（记录 id）。
- **成功响应**（`200`）：`{"data": {...同 data 字段...}}`
- **错误**：`404` `{"error": "Record not found"}`

### `POST /api/sensors`
- **认证**：**不需要**（设备上报）。
- **说明**：设备凭序列号上报传感器数据，写入该设备对应的读数表。设备无需登录，身份由 `serial` 标识。
- **请求体（JSON）**：
  | 字段 | 类型 | 必填 | 说明 |
  |------|------|------|------|
  | `serial` | string | 是 | 设备序列号（也兼容旧字段 `deviceid`） |
  | `ph` | string | 否 | 酸碱度 |
  | `temperature` | string | 否 | 温度 (°C) |
  | `flow` | string | 否 | 水流量 |
  | `turbidity` | string | 否 | 浊度 |
  | `conductivity` | string | 否 | 电导率 |

- **成功响应**（`201`）：
  ```json
  {"data": {"id": 321, "device_id": 2, "serial": "e7980eab5386", "device_name": "河边一号", "ph": "7.1", "temperature": "20.5", "flow": "5", "turbidity": "", "conductivity": "", "created_at": "2026-09-01 16:40:00"}}
  ```
- **错误**：
  - `400` `{"error": "Field 'serial' is required"}`
  - `404` `{"error": "设备不存在或序列号无效"}`

### `PUT /api/sensors/<record_id>`
- **认证**：需要。
- **说明**：更新某条读数（支持部分字段更新；`ph/temperature/flow/turbidity/conductivity`）。
- **路径参数**：`record_id`。
- **请求体**：可包含上述测量字段中的任意几项。
- **成功响应**（`200`）：`{"data": {...更新后的记录...}}`
- **错误**：`404` `{"error": "Record not found"}`

### `DELETE /api/sensors/<record_id>`
- **认证**：需要。
- **说明**：删除某条读数。
- **路径参数**：`record_id`。
- **成功响应**（`200`）：`{"message": "Record deleted"}`
- **错误**：`404` `{"error": "Record not found"}`

---

## 3.5 阈值设置模块（Settings）

设备默认用固件内置宏作为报警阈值；设备上电后可从服务器拉取各设备的独立阈值（`GET /api/settings`），服务器端允许设备所属用户编辑（`PUT /api/settings`）。未配置任何阈值时按固件默认值返回（温度 0~50℃、流量 300、电导率 500、浊度 40）。

### `GET /api/settings`
- **认证**：**不需要**（设备拉取）。
- **说明**：按设备序列号返回该设备的报警阈值；无记录时按默认值返回并落一行。
- **查询参数**：`serial`（设备序列号，必填）。
- **成功响应**（`200`）：
  ```json
  {"data": {"serial": "e7980eab5386", "temp_low_c": 0.0, "temp_high_c": 50.0,
            "flow_high_lpm": 300.0, "ec_high_us_cm": 500.0, "turb_high_ntu": 40.0,
            "updated_at": "2026-09-01 16:40:00"}}
  ```
- **错误**：`404` `{"error": "设备不存在或序列号无效"}`

### `PUT /api/settings`
- **认证**：需要（设备所属用户）。
- **说明**：更新某设备阈值，支持部分字段更新，仅能改自己名下的设备。
- **请求体（JSON）**：
  | 字段 | 类型 | 说明 |
  |------|------|------|
  | `serial` | string | 设备序列号（必填） |
  | `temp_low_c` | number | 温度下限（≤ 此值报警） |
  | `temp_high_c` | number | 温度上限（> 此值报警） |
  | `flow_high_lpm` | number | 流量上限 |
  | `ec_high_us_cm` | number | 电导率上限 |
  | `turb_high_ntu` | number | 浊度上限 |

- **成功响应**（`200`）：`{"data": {...更新后的阈值...}}`
- **错误**：
  - `400` `{"error": "Field 'serial' is required"}` / `{"error": "阈值必须是数字"}` / `{"error": "温度下限必须小于上限"}`
  - `401` 未登录
  - `404` `{"error": "设备不存在或无权修改"}`

---

## 4. 网页模块（Web）

### `GET /`
- **认证**：需要。
- **说明**：渲染单页前端（`index.html`），展示当前登录用户设备的数据。未登录自动重定向到 `/login`。

---

## 使用示例（curl）

**1. 登录（保存 Cookie）**
```bash
curl -c cookie.txt -X POST http://localhost:15382/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"yw","password":"你的密码"}'
```

**2. 为设备分配序列号并绑定用户（无需登录）**
```bash
curl -X POST http://localhost:15382/api/devices \
  -H "Content-Type: application/json" \
  -d '{"username":"yw","name":"河边一号"}'
```

**3. 设备凭序列号上报数据（无需登录）**
```bash
curl -X POST http://localhost:15382/api/sensors \
  -H "Content-Type: application/json" \
  -d '{"serial":"e7980eab5386","ph":"7.1","temperature":"20.5","flow":"5","turbidity":"2","conductivity":"90"}'
```

**4. 查看当前用户设备及其数据**
```bash
curl -b cookie.txt http://localhost:15382/api/devices
curl -b cookie.txt "http://localhost:15382/api/sensors?limit=50"
```

**5. 退出登录**
```bash
curl -b cookie.txt -X POST http://localhost:15382/api/auth/logout
```
