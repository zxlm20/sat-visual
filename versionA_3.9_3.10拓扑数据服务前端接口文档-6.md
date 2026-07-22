# VersionA 3.9 / 3.10 拓扑数据服务前端接口文档

## 1. 基本信息

- 后端地址：`http://192.168.5.11:30080`
- 模块路径：`/api/topology`
- 覆盖需求：
  - 3.9 二维拓扑数据服务
  - 3.10 三维拓扑数据服务
- 数据来源：
  - 3.1 星历解析：卫星位置、轨迹、轨道层、轨道面
  - 3.2 节点建模：节点编号、逻辑 IPv4/IPv6、物理绑定关系、可配置星座分组
  - 3.4 资源状态：CPU、内存、磁盘、网络、NPU 预留字段
  - 3.5 负载判定：负载分数、负载等级、告警状态
  - dispatcher 历史任务：最新任务流、切片分发数量、业务链路

说明：当前 Version A 是地面中心演示版，链路中的 `gsl_demo`、`isl_intra_plane` 是用于前端展示的可用性演示链路；真实星间链路、星地可见性、带宽、时延和丢包率会在后续 3.6 / 3.7 中增强。

概念约定：

- `orbit_layer` 是物理轨道层，来自星历，取值如 `MEO`、`HEO`。
- `constellation_id` / `constellation_name` 是业务星座分组，可由前端通过 `/api/constellations/groups` 配置，允许跨轨道层、跨轨道面。
- 兼容字段 `constellation` 当前等同于 `constellation_name`。

## 2. 查询二维拓扑

```http
GET /api/topology/2d
```

常用示例：

```http
GET /api/topology/2d?time_index=0
GET /api/topology/2d?time_index=60&orbit_layer=MEO
GET /api/topology/2d?constellation_id=constellation-a
GET /api/topology/2d?orbit_layer=HEO&include_simulated_links=false
```

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `time_index` | int | 否 | 星历时间序号，默认 `0`，当前 CSV 为 1 分钟一个点 |
| `orbit_layer` | string | 否 | `LEO` / `MEO` / `HEO`，不传返回全部轨道层和地面节点 |
| `constellation_id` | string | 否 | 按业务星座分组过滤，例如 `constellation-a` |
| `include_simulated_links` | bool | 否 | 是否返回演示星间/星地链路，默认 `true` |

返回示例：

```json
{
  "mode": "version_a_topology_2d",
  "time_index": 0,
  "sample_interval_seconds": 60,
  "time_offset_seconds": 0,
  "latest_job_id": "20260708_081502_versionA_P1235_bd30229e",
  "nodes": [
    {
      "id": "Ground001",
      "label": "Ground Center",
      "node_type": "ground",
      "orbit_layer": "GROUND",
      "orbit_shell_type": "GROUND",
      "constellation_id": "ground-center",
      "constellation_name": "Ground Center",
      "constellation": "Ground Center",
      "constellation_color": "#0f172a",
      "logical_ipv4": "10.10.0.1",
      "logical_ipv6": "fd00:310::1",
      "physical_node": "hnode01",
      "physical_ipv4": "192.168.5.11",
      "online": true,
      "worker_ready": false,
      "resource": {
        "cpu_percent": 27.62,
        "memory_percent": 34.94,
        "disk_root_percent": 80.78,
        "npu_ai_core_percent": null,
        "npu_memory_percent": null,
        "network_receive_bytes_per_second": 428742.04,
        "network_transmit_bytes_per_second": 10195.44,
        "task_queue_len": 0
      },
      "load": {
        "score": 46.3,
        "level": "normal",
        "label": "正常",
        "alarm_level": "warning"
      },
      "status": {
        "online": true,
        "alarm_level": "warning",
        "load_level": "normal",
        "load_label": "正常",
        "load_score": 46.3
      },
      "geo": {
        "lat_deg": 31.2304,
        "lon_deg": 121.4737,
        "altitude_km": 0
      },
      "x": 121.4737,
      "y": 31.2304,
      "layout": {
        "x": 121.4737,
        "y": 31.2304,
        "layer_band": 0
      },
      "available_link_count": 2
    }
  ],
  "links": [
    {
      "id": "task-Ground001-M001001",
      "source": "Ground001",
      "target": "M001001",
      "type": "task_stream",
      "link_type": "task_stream",
      "status": "up",
      "traffic": 18,
      "traffic_level": "light",
      "traffic_label": "轻度拥塞",
      "color_level": 3,
      "business_type": "image_tile_inference",
      "stream": "tile_tasks:lnode01",
      "assigned_cost": 31.7619,
      "bandwidth_utilization_percent": null,
      "latency_ms": null,
      "loss_percent": null,
      "congestion_level": "light"
    }
  ],
  "legend": {
    "node_types": ["ground", "satellite"],
    "orbit_layers": ["GROUND", "LEO", "MEO", "HEO"],
    "link_types": ["physical_access", "task_stream", "gsl_demo", "isl_intra_plane"],
    "traffic_levels": ["idle", "smooth", "normal", "light", "medium", "heavy"],
    "load_levels": ["idle", "smooth", "normal", "light", "medium", "heavy"]
  }
}
```

二维前端建议：

- 使用 `x/y` 或 `layout.x/layout.y` 绘制平面位置。
- `layout.layer_band` 可用于将地面、LEO、MEO、HEO 分层排布。
- 节点颜色建议优先使用 `status.alarm_level` 或 `load.level`。
- 链路颜色建议使用 `color_level`，数值越大表示业务流量越高。
- `task_stream` 表示真实推理任务分发链路，`physical_access` 表示地面中心与半物理节点绑定关系，`gsl_demo` / `isl_intra_plane` 是拓扑展示链路。

## 3. 查询三维拓扑

```http
GET /api/topology/3d
```

常用示例：

```http
GET /api/topology/3d?time_index=0
GET /api/topology/3d?time_index=60&orbit_layer=MEO
GET /api/topology/3d?constellation_id=constellation-a
GET /api/topology/3d?orbit_layer=MEO&include_trajectories=true&trajectory_stride=240&trajectory_limit=100
```

查询参数：

| 参数 | 类型 | 必填 | 说明 |
|---|---|---:|---|
| `time_index` | int | 否 | 星历时间序号，默认 `0` |
| `orbit_layer` | string | 否 | `LEO` / `MEO` / `HEO`，不传返回全部轨道层和地面节点 |
| `constellation_id` | string | 否 | 按业务星座分组过滤，例如 `constellation-a` |
| `include_simulated_links` | bool | 否 | 是否返回演示星间/星地链路，默认 `true` |
| `include_trajectories` | bool | 否 | 是否返回轨迹点，默认 `false` |
| `trajectory_stride` | int | 否 | 轨迹采样步长，默认 `120` |
| `trajectory_limit` | int | 否 | 单星最多返回轨迹点数量，默认 `300` |

返回与二维拓扑基本一致，三维节点额外包含：

```json
{
  "scene": {
    "earth_radius_km": 6371.0,
    "coordinate_frame": "J2000 position with approximate lat/lon projection",
    "default_camera": {
      "target": "earth",
      "distance_radius": 4.5
    }
  },
  "nodes": [
    {
      "id": "M001001",
      "geo": {
        "lat_deg": 12.34,
        "lon_deg": 56.78,
        "altitude_km": 20180.0
      },
      "cartesian_km": {
        "x": 1234.56,
        "y": 2345.67,
        "z": 3456.78
      },
      "trajectory": [
        {
          "time_index": 0,
          "position": {
            "x_km": 1234.56,
            "y_km": 2345.67,
            "z_km": 3456.78,
            "lat_deg_approx": 12.34,
            "lon_deg_approx": 56.78,
            "altitude_km": 20180.0
          }
        }
      ]
    }
  ]
}
```

三维前端建议：

- 使用 `cartesian_km.x/y/z` 绘制真实三维位置。
- 地面节点 `cartesian_km` 可能为 `null`，可用 `geo.lat_deg/lon_deg` 贴地绘制。
- 默认不要打开 `include_trajectories`，只在用户进入轨迹/回放模式时打开，避免响应数据过大。
- 如果打开轨迹，建议先使用 `trajectory_stride=240` 或更大步长。

## 4. 查询链路列表

```http
GET /api/topology/links
```

示例：

```http
GET /api/topology/links?time_index=0
GET /api/topology/links?orbit_layer=MEO
GET /api/topology/links?constellation_id=constellation-a
```

返回示例：

```json
{
  "time_index": 0,
  "links": [
    {
      "id": "access-Ground001-M001001",
      "source": "Ground001",
      "target": "M001001",
      "link_type": "physical_access",
      "status": "up",
      "traffic": 0,
      "traffic_level": "idle",
      "traffic_label": "空闲",
      "color_level": 0,
      "business_type": "management",
      "physical_node": "lnode01"
    }
  ]
}
```

## 5. 字段说明

节点字段：

| 字段 | 说明 |
|---|---|
| `id` | 逻辑节点编号，如 `Ground001`、`M001001`、`H004001` |
| `node_type` | `ground` 或 `satellite` |
| `orbit_layer` | `GROUND` / `LEO` / `MEO` / `HEO` |
| `orbit_shell_type` | 星历中的轨道壳层/类型兼容字段 |
| `constellation_id` | 业务星座分组 ID |
| `constellation_name` | 业务星座分组显示名 |
| `constellation_color` | 业务星座分组颜色建议 |
| `plane_id` | 轨道面编号 |
| `satellite_index` | 轨道面内编号 |
| `logical_ipv4` / `logical_ipv6` | 3.2 分配的逻辑地址 |
| `physical_node` | 半物理绑定节点，如 `lnode01` |
| `resource` | 3.4 资源状态摘要 |
| `load` | 3.5 负载判定摘要 |
| `geo` | 近似经纬度和高度 |
| `cartesian_km` | 三维 J2000 坐标，单位 km |

链路字段：

| 字段 | 说明 |
|---|---|
| `source` / `target` | 链路两端节点编号 |
| `link_type` | `physical_access` / `task_stream` / `gsl_demo` / `isl_intra_plane` |
| `status` | `up` 表示真实可用，`available` 表示演示可用 |
| `traffic` | 当前业务量，Version A 中主要来自最新 dispatcher 分发数量 |
| `traffic_level` | `idle` / `smooth` / `normal` / `light` / `medium` / `heavy` |
| `color_level` | 前端可直接映射颜色，范围 `0-5` |
| `business_type` | 业务类型，如 `image_tile_inference` |

## 6. 推荐联调命令

```bash
curl "http://192.168.5.11:30080/api/topology/2d?time_index=0"
curl "http://192.168.5.11:30080/api/topology/3d?time_index=0&include_trajectories=false"
curl "http://192.168.5.11:30080/api/topology/links?time_index=0"
curl "http://192.168.5.11:30080/api/topology/2d?constellation_id=constellation-a"
curl "http://192.168.5.11:30080/api/topology/3d?time_index=60&orbit_layer=MEO&include_trajectories=true&trajectory_stride=240&trajectory_limit=100"
```

## 7. 当前完成度说明

- 3.9 二维拓扑：已提供节点、链路、资源状态、负载状态、最新任务流、轨道层过滤。
- 3.10 三维拓扑：已提供 J2000 三维坐标、近似经纬度、高度、可选轨迹、三维场景元数据。
- 待后续增强：真实星间链路、星地可见性、链路带宽、时延、丢包、拥塞曲线、业务路径回放。
