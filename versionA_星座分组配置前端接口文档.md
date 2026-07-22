# VersionA 星座分组配置前端接口文档

## 1. 概念说明

本次调整后，后端把两个概念拆开：

- `orbit_layer`：物理轨道层，来自星历解析，取值如 `MEO`、`HEO`，不由前端业务配置修改。
- `constellation_id` / `constellation_name`：业务星座分组，可由前端配置。一个星座可以跨轨道层、跨轨道面，例如同时包含 `M001001`、`M003008`、`H001003`。

兼容字段：

- 节点中的 `constellation` 仍然保留，但现在含义改为星座分组名称。
- 星历接口中的旧字段 `constellation_type` 保留兼容，建议前端以后用 `orbit_shell_type` 表示轨道壳层/轨道类型。

## 2. 查询星座分组

```http
GET /api/constellations/groups
```

可选参数：

| 参数 | 类型 | 说明 |
|---|---|---|
| `include_unassigned` | bool | 是否返回未分配卫星，默认 `true` |

返回示例：

```json
{
  "version": 1,
  "updated_at": 1784500000,
  "groups": [
    {
      "constellation_id": "constellation-a",
      "constellation_name": "Constellation A",
      "color": "#2563eb",
      "description": "Default cross-layer demonstration group.",
      "members": ["M001001", "M001002", "M001003", "M001004", "H001001"],
      "member_count": 5,
      "orbit_layers": ["HEO", "MEO"],
      "cross_layer": true
    }
  ],
  "unassigned": [],
  "unassigned_count": 0,
  "source": "constellation_groups_config",
  "note": "Constellation groups are configurable and independent from orbit_layer."
}
```

## 3. 新增或修改单个星座

```http
POST /api/constellations/groups
Content-Type: application/json
```

请求示例：

```json
{
  "constellation_id": "constellation-a",
  "constellation_name": "Constellation A",
  "color": "#2563eb",
  "description": "Main demo group",
  "members": ["M001001", "M003008", "H001003"]
}
```

说明：

- `constellation_id` 不传时，后端会根据名称自动生成。
- `members` 可以跨 `MEO` / `HEO`。
- 同一颗卫星不能同时属于多个星座，否则返回 `400`。

## 4. 一次性保存全部星座配置

```http
PUT /api/constellations/groups
Content-Type: application/json
```

请求示例：

```json
{
  "groups": [
    {
      "constellation_id": "constellation-a",
      "constellation_name": "Constellation A",
      "color": "#2563eb",
      "members": ["M001001", "M003008", "H001003"]
    },
    {
      "constellation_id": "constellation-b",
      "constellation_name": "Constellation B",
      "color": "#16a34a",
      "members": ["M001002", "M001003", "H004001"]
    }
  ]
}
```

适用场景：前端星座配置面板拖拽调整完成后，一次性保存整个配置。

## 5. 移动单颗卫星到指定星座

```http
POST /api/constellations/groups/move-member
Content-Type: application/json
```

请求示例：

```json
{
  "node_id": "M003008",
  "constellation_id": "constellation-a"
}
```

返回示例：

```json
{
  "node_id": "M003008",
  "constellation_id": "constellation-a",
  "constellation_name": "Constellation A",
  "constellation": "Constellation A",
  "constellation_color": "#2563eb"
}
```

说明：移动时后端会自动把该卫星从原星座移除，保证一颗卫星只属于一个星座。

## 6. 将卫星移出星座

```http
DELETE /api/constellations/groups/members/{node_id}
```

示例：

```http
DELETE /api/constellations/groups/members/M003008
```

返回示例：

```json
{
  "node_id": "M003008",
  "constellation_id": null,
  "constellation_name": null,
  "constellation": null
}
```

## 7. 删除星座

```http
DELETE /api/constellations/groups/{constellation_id}
```

示例：

```http
DELETE /api/constellations/groups/constellation-a
```

删除后，该星座内卫星会变成未分配状态。

## 8. 恢复默认星座

```http
POST /api/constellations/groups/reset-defaults
```

默认配置把 30 颗星分为 6 个业务星座，每个星座约 5 颗卫星，并且示范跨 `MEO` / `HEO` 的分组能力。

## 9. 节点模型中的相关字段

查询：

```http
GET /api/node-models
```

节点中会新增或更新这些字段：

```json
{
  "node_id": "M001001",
  "orbit_layer": "MEO",
  "orbit_shell_type": "MEO",
  "constellation_id": "constellation-a",
  "constellation_name": "Constellation A",
  "constellation": "Constellation A",
  "constellation_color": "#2563eb"
}
```

前端建议：

- 分层筛选使用 `orbit_layer`。
- 星座筛选、颜色、图例使用 `constellation_id`、`constellation_name`、`constellation_color`。
- 不要再把 `MEO` / `HEO` 当作星座名称。

## 10. 拓扑接口联动

二维、三维、链路接口都支持按星座过滤：

```http
GET /api/topology/2d?constellation_id=constellation-a
GET /api/topology/3d?constellation_id=constellation-a
GET /api/topology/links?constellation_id=constellation-a
```

也可以同时按轨道层和星座过滤：

```http
GET /api/topology/3d?orbit_layer=MEO&constellation_id=constellation-a
```
