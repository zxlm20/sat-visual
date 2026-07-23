<template>
  <section
    v-if="current"
    class="function-panel"
    :class="{
      wide: current.id === 'tasks',
      'constellation-wide': current.id === 'constellation',
      'balance-wide': current.id === 'balance',
      'topology-full': current.id === 'topology'
    }"
  >
    <Teleport to="body">
      <div
        v-if="operationNotice.message"
        class="operation-notice"
        :class="operationNotice.type"
        role="status"
      >
        <div>
          <strong>{{ operationNotice.type === 'error' ? '操作失败' : '操作成功' }}</strong>
          <span>{{ operationNotice.message }}</span>
        </div>
        <button type="button" aria-label="关闭提示" @click="operationNotice.message = ''">×</button>
      </div>
    </Teleport>

    <header class="panel-header">
      <div>
        <span class="eyebrow">{{ current.icon }} / 控制模块</span>
        <h2>{{ current.name }}</h2>
      </div>

      <button
        class="close-btn"
        type="button"
        @click="closePanel"
      >
        关闭
      </button>
    </header>

    <div class="content">
      <div
        v-if="current.id === 'tasks'"
        class="module task-module"
      >
        <div class="summary-card">
          <span>历史任务</span>
          <strong>调度记录查询</strong>
          <p>列表来自 /api/jobs，点击任务后会继续请求任务详情与 tiles 明细。</p>
        </div>

        <div class="task-toolbar">
          <button
            type="button"
            @click="loadJobs"
          >
            {{ taskState.loadingJobs ? '刷新中...' : '刷新历史任务' }}
          </button>
          <span>{{ taskState.jobs.length }} 条记录</span>
        </div>

        <div
          v-if="taskState.error"
          class="error-box"
        >
          {{ taskState.error }}
        </div>

        <div class="task-layout">
          <div class="job-list">
            <button
              v-for="job in taskState.jobs"
              :key="job.job_id"
              type="button"
              class="job-item"
              :class="{ active: taskState.selectedJobId === job.job_id }"
              @click="openJob(job.job_id)"
            >
              <span>{{ job.job_id }}</span>
              <small>{{ job.tile_count || 0 }} tiles / {{ job.policy || '未知策略' }}</small>
            </button>

            <div
              v-if="!taskState.loadingJobs && taskState.jobs.length === 0"
              class="empty-box"
            >
              暂无历史任务
            </div>
          </div>

          <div class="job-detail">
            <div
              v-if="taskState.loadingDetail"
              class="empty-box"
            >
              正在加载任务详情...
            </div>

            <template v-else-if="taskState.jobDetail">
              <div class="detail-head">
                <span>任务详情</span>
                <strong>{{ taskState.jobDetail.job_id }}</strong>
              </div>

              <div class="stat-grid">
                <div class="stat-card">
                  <span>切片数量</span>
                  <strong>{{ manifest.tile_count || '-' }}</strong>
                </div>
                <div class="stat-card">
                  <span>策略</span>
                  <strong>{{ scheduling.policy || '-' }}</strong>
                </div>
                <div class="stat-card">
                  <span>Tiles</span>
                  <strong>{{ taskState.tiles.length }}</strong>
                </div>
              </div>

              <div class="info-list">
                <div>
                  <span>任务目录</span>
                  <strong>{{ taskState.jobDetail.job_dir || '-' }}</strong>
                </div>
                <div>
                  <span>分配数量</span>
                  <strong>{{ formatObject(scheduling.assigned_count) }}</strong>
                </div>
              </div>

              <div class="tile-table">
                <div class="tile-row head">
                  <span>tile_id</span>
                  <span>节点</span>
                  <span>难度</span>
                </div>
                <div
                  v-for="tile in visibleTiles"
                  :key="tile.tile_id"
                  class="tile-row"
                >
                  <span>{{ tile.tile_id }}</span>
                  <span>{{ tile.assigned_node || '-' }}</span>
                  <span>{{ tile.difficulty_level || '-' }}</span>
                </div>
              </div>
            </template>

            <div
              v-else
              class="empty-box"
            >
              请选择左侧历史任务
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="current.id === 'node'"
        class="module"
      >
        <div class="summary-card">
          <span>网络节点目录</span>
          <strong>星地一体节点清单</strong>
          <p>合并 /api/nodes 与 /api/constellations/nodes，点击节点可查询具体信息。</p>
        </div>

        <div class="task-toolbar">
          <button type="button" @click="loadNodeDirectory">
            {{ nodeDirectoryLoading ? '刷新中...' : '刷新全部节点' }}
          </button>
          <span>{{ nodeDirectory.length }} / {{ allNodeDirectory.length }} 个节点</span>
        </div>

        <div class="directory-filters">
          <label>
            <span>轨道层级</span>
            <select v-model="nodeLayerFilter">
              <option value="">全部层级</option>
              <option value="LEO">低轨</option>
              <option value="MEO">中轨</option>
              <option value="HEO">高轨</option>
              <option value="GROUND">地面</option>
            </select>
          </label>
          <label>
            <span>所属星座</span>
            <select v-model="nodeConstellationFilter">
              <option value="">全部星座</option>
              <option
                v-for="group in constellationFilterOptions"
                :key="group.constellation_id"
                :value="group.constellation_id"
              >
                {{ group.constellation_name }}（{{ group.member_count ?? (group.members || []).length }}）
              </option>
              <option value="__unassigned__">未分配星座</option>
            </select>
          </label>
          <label>
            <span>节点状态</span>
            <select v-model="nodeStatusFilter">
              <option value="">全部状态</option>
              <option value="online">在线</option>
              <option value="offline">离线</option>
            </select>
          </label>
          <label class="directory-search">
            <span>节点名称</span>
            <input
              v-model.trim="nodeNameKeyword"
              type="search"
              placeholder="输入名称或编号"
              @keyup.enter="applyNodeFilter"
            />
          </label>
          <div class="directory-filter-actions">
            <button type="button" class="secondary" @click="resetNodeFilter">重置</button>
            <button type="button" @click="applyNodeFilter">筛选</button>
          </div>
        </div>

        <div class="stat-grid">
          <div class="stat-card">
            <span>低轨 LEO</span>
            <strong>{{ leoNodeCount }}</strong>
          </div>
          <div class="stat-card">
            <span>中轨 MEO</span>
            <strong>{{ meoNodeCount }}</strong>
          </div>
          <div class="stat-card">
            <span>高轨 HEO</span>
            <strong>{{ heoNodeCount }}</strong>
          </div>
        </div>

        <div v-if="nodeDirectoryError" class="error-box">
          {{ nodeDirectoryError }}
        </div>

        <div class="directory-list">
          <button
            v-for="node in nodeDirectory"
            :key="node.node_id"
            type="button"
            class="directory-item"
            :style="{ '--node-color': node.directoryColor }"
            @click="openLoadNode(node)"
          >
            <span class="directory-dot"></span>
            <span class="directory-main">
              <strong>{{ node.node_id }}</strong>
              <small>{{ node.directoryDescription }}</small>
            </span>
            <span class="directory-meta">
              <strong>{{ node.directoryLabel }}</strong>
              <small>{{ node.directoryExtra }}</small>
            </span>
          </button>

          <div
            v-if="!nodeDirectoryLoading && nodeDirectory.length === 0"
            class="empty-box"
          >
            {{ allNodeDirectory.length ? '没有符合条件的节点' : '暂无网络节点' }}
          </div>
        </div>
      </div>

      <div
        v-else-if="current.id === 'physical'"
        class="module physical-module"
      >
        <div class="summary-card">
          <span>节点建模与半物理接入</span>
          <strong>{{ nodeModelState.models.length }} 个持久化节点模型</strong>
          <p>同步星历节点档案，管理逻辑 IP 地址池，并维护逻辑卫星与真实 KubeEdge 设备的绑定关系。</p>
        </div>

        <div class="resource-service-card" :class="{ ready: resourceState.status?.ready }">
          <div>
            <span>物理资源监控</span>
            <strong>{{ resourceServiceStatusText }}</strong>
          </div>
          <small>
            {{ resourceOnlineTargetCount }}/{{ resourceTargets.length }} 个采集目标在线 ·
            {{ resourceState.metricsCurrent.length }} 项实时指标 ·
            {{ resourceState.metricsHistory.length }} 项历史指标
          </small>
          <small>Prometheus：{{ resourceState.status?.prometheus_url || '后端未返回地址' }}</small>
          <small>状态时间：{{ formatResourceUpdateTime(resourceState.status?.timestamp) }}</small>
          <small v-if="resourceState.error" class="resource-service-error">{{ resourceState.error }}</small>
          <button type="button" :disabled="resourceState.loadingStatus" @click="refreshResourceService">
            {{ resourceState.loadingStatus ? '刷新中...' : '刷新监控状态' }}
          </button>
          <div v-if="resourceTargets.length" class="resource-targets">
            <span v-for="(target, index) in resourceTargets" :key="`${target.instance || target.node || 'target'}-${index}`" :class="{ online: target.up }">
              <b>{{ target.node || target.instance }} · {{ formatTargetStatus(target.up) }}</b>
              <small>{{ target.instance || '实例地址未知' }} · value={{ target.value ?? '未返回' }}</small>
            </span>
          </div>
          <div v-if="npuCollectorTargets.length" class="resource-targets npu-targets">
            <strong>NPU 采集器</strong>
            <span v-for="(target, index) in npuCollectorTargets" :key="`npu-${target.instance || target.node || index}`" :class="{ online: target.up }">
              <b>{{ target.node || target.instance }} · {{ formatTargetStatus(target.up) }}</b>
              <small>{{ target.instance || '实例地址未知' }} · value={{ target.value ?? '未返回' }}</small>
            </span>
          </div>
          <details v-if="resourceState.metrics.length || resourceState.metricsNote" class="resource-metric-catalog">
            <summary>查看支持的资源指标（{{ resourceState.metrics.length }} 项）</summary>
            <div>
              <strong>实时指标</strong>
              <span v-for="metric in resourceState.metricsCurrent" :key="`current-${metric}`">{{ metric }}</span>
            </div>
            <div>
              <strong>历史指标</strong>
              <span v-for="metric in resourceState.metricsHistory" :key="`history-${metric}`">{{ metric }}</span>
            </div>
            <p v-if="resourceState.metricsNote">NPU 说明：{{ resourceState.metricsNote }}</p>
          </details>
        </div>

        <div class="section-heading resource-overview-heading">
          <span>节点实时资源</span>
          <small>
            {{ resourceState.nodes.length }} 个节点 · {{ resourceState.source || '数据源未知' }} ·
            {{ formatResourceUpdateTime(resourceState.updateTime) }}
          </small>
        </div>
        <div v-if="resourceState.nodes.length" class="resource-node-list">
          <button
            v-for="(resource, index) in resourceState.nodes"
            :key="`${resource.node_id || resource.physical_node || 'resource'}-${index}`"
            type="button"
            :class="['resource-node-card', resource.alarm_level]"
            @click="openNode(resource.node_id || resource.logical_node_id || resource.physical_node)"
          >
            <span>
              <strong>{{ resource.node_id || resource.logical_node_id || resource.physical_node }}</strong>
              <small>{{ resource.physical_node || '物理节点' }} · {{ formatResourceAlarm(resource.alarm_level) }} · NPU {{ formatNpuAvailability(resource) }}</small>
            </span>
            <span><small>CPU</small><strong>{{ formatResourcePercent(resource.cpu_percent) }}</strong></span>
            <span><small>内存</small><strong>{{ formatResourcePercent(resource.memory_percent) }}</strong></span>
            <span><small>磁盘</small><strong>{{ formatResourcePercent(resource.disk_root_percent) }}</strong></span>
          </button>
        </div>
        <div v-else-if="!resourceState.loadingNodes" class="empty-box resource-node-empty">
          暂无已采集的物理节点资源。请先完成逻辑节点与物理节点绑定，并检查 Prometheus 采集状态。
        </div>

        <div class="management-actions">
          <label><input v-model="syncBindDemoWorkers" type="checkbox" /> 自动绑定演示边缘节点</label>
          <label><input v-model="syncOverwrite" type="checkbox" /> 覆盖已有节点档案</label>
          <button type="button" :disabled="nodeModelState.saving" @click="syncModelsNow">
            {{ nodeModelState.saving ? '处理中...' : '从星历同步节点模型' }}
          </button>
        </div>

        <div v-if="nodeDirectoryError" class="error-box">{{ nodeDirectoryError }}</div>
        <div v-if="nodeModelState.actionMessage" class="success-box">
          {{ nodeModelState.actionMessage }}
        </div>
        <div v-if="hasInvalidBackendIpv6Pools" class="warning-box pool-warning">
          <strong>后端 IPv6 地址池格式不合法</strong>
          <p>ground / leo / meo / heo 不能出现在标准 IPv6 地址中。请先修复地址池，再执行覆盖同步。</p>
          <button type="button" :disabled="nodeModelState.saving" @click="repairIpv6Pools">
            {{ nodeModelState.saving ? '修复中...' : '修复并保存四层 IPv6 地址池' }}
          </button>
        </div>

        <div class="section-heading">
          <span>IP 地址池</span>
          <small>按轨道层管理逻辑 IPv4 / IPv6 范围</small>
        </div>
        <div class="pool-list">
          <div v-for="layer in poolLayers" :key="layer" class="pool-card">
            <strong>{{ formatLayer(layer) }}</strong>
            <label>
              <span>IPv4 CIDR</span>
              <input v-model="poolDraft[layer].ipv4_cidr" type="text" />
            </label>
            <label>
              <span>IPv6 CIDR</span>
              <input v-model="poolDraft[layer].ipv6_cidr" type="text" />
            </label>
            <button type="button" :disabled="nodeModelState.saving" @click="savePoolDraft(layer)">
              保存 {{ layer }} 地址池
            </button>
          </div>
        </div>

        <div class="section-heading">
          <span>物理节点绑定</span>
          <small>{{ nodeModelState.bindings.length }} 条绑定关系</small>
        </div>
        <div class="binding-form">
          <select v-model="bindingDraft.node_id">
            <option value="">选择逻辑节点</option>
            <option v-for="model in nodeModelState.models" :key="model.node_id" :value="model.node_id">
              {{ model.node_id }} / {{ model.node_name }}
            </option>
          </select>
          <select v-model="bindingDraft.physical_node">
            <option value="">选择物理节点</option>
            <option v-for="node in physicalNodeOptions" :key="node.physical_node" :value="node.physical_node">
              {{ node.physical_node }} / {{ node.physical_ipv4 || '无 IP' }} / {{ formatTargetStatus(node.online) }}{{ node.bound_node_id ? ` / 已绑定 ${node.bound_node_id}` : '' }}
            </option>
          </select>
          <input v-model="bindingDraft.physical_ipv4" type="text" placeholder="选择物理节点后自动填写 IP" readonly />
          <p v-if="selectedPhysicalBinding && selectedPhysicalBinding.node_id !== bindingDraft.node_id" class="binding-occupied">
            当前物理节点已绑定 {{ selectedPhysicalBinding.node_id }}，保存时会询问是否切换。
          </p>
          <input v-model.trim="bindingDraft.binding_role" type="text" placeholder="绑定角色" />
          <button type="button" :disabled="nodeModelState.saving" @click="saveBindingDraft">
            保存绑定
          </button>
        </div>

        <div class="binding-list">
          <div v-for="binding in nodeModelState.bindings" :key="binding.node_id" class="binding-card">
            <button type="button" class="binding-main" @click="openNode(binding.node_id)">
              <strong>{{ binding.node_id }} → {{ binding.physical_node }}</strong>
              <small>{{ binding.physical_ipv4 || '-' }} · {{ binding.binding_role || '-' }}</small>
            </button>
            <button type="button" class="danger-btn" @click="removeBindingNow(binding.node_id)">解除</button>
          </div>
          <div v-if="!nodeModelState.bindings.length" class="empty-box">暂无物理节点绑定</div>
        </div>
      </div>

      <div
        v-else-if="current.id === 'topology'"
        class="module topology-module"
      >
        <div class="topology-workspace-tabs" role="tablist" aria-label="网络拓扑功能">
          <button
            type="button"
            role="tab"
            :aria-selected="topologyView === 'map'"
            :class="{ active: topologyView === 'map' }"
            @click="selectTopologyView('map')"
          >
            <strong>二维关系图</strong>
            <small>节点、任务流和物理接入关系</small>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="topologyView === 'dynamic'"
            :class="{ active: topologyView === 'dynamic' }"
            @click="selectTopologyView('dynamic')"
          >
            <strong>动态拓扑</strong>
            <small>几何可见性、历史与规则</small>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="topologyView === 'links'"
            :class="{ active: topologyView === 'links' }"
            @click="selectTopologyView('links')"
          >
            <strong>链路状态</strong>
            <small>拥塞、阈值、历史和业务流</small>
          </button>
        </div>

        <div v-if="topologyView === 'map'" class="topology-map-view">
        <div class="summary-card">
          <span>二维拓扑</span>
          <strong>{{ topologyState.latest_job_id || '暂无最新任务' }}</strong>
          <p>节点位置来自当前星历，实线表示真实任务流/物理接入，虚线表示当前版本的演示星地/星间关系。</p>
        </div>

        <div class="task-toolbar">
          <button type="button" @click="loadTopology">
            {{ topologyState.loading ? '刷新中...' : '刷新二维拓扑' }}
          </button>
          <span>{{ topologyNodes.length }} 节点 / {{ topologyLinks.length }} 链路</span>
        </div>

        <div class="topology-controls">
          <label><span>星历时间序号（0 为起点，每 1 表示 1 分钟）</span><input v-model.number="topologyTimeIndex" type="number" min="0" max="20160" step="1" /></label>
          <label><span>轨道层</span><select v-model="topologyOrbitLayer"><option value="">全部轨道层</option><option value="LEO">低轨 LEO</option><option value="MEO">中轨 MEO</option><option value="HEO">高轨 HEO</option></select></label>
          <label><span>星座</span><select v-model="topologyConstellationId"><option value="">全部星座</option><option v-for="group in constellationFilterOptions" :key="`topology-${group.constellation_id}`" :value="group.constellation_id">{{ group.constellation_name }}（{{ group.members?.length || 0 }}）</option></select></label>
          <label class="topology-simulated"><input v-model="topologyIncludeSimulated" type="checkbox" />显示演示链路</label>
        </div>

        <div v-if="topologyState.error" class="error-box">{{ topologyState.error }}</div>

        <div class="topology-legends">
          <span v-for="(meta, key) in topologyTrafficLevels" :key="key"><i :style="{ background: meta.color }"></i>{{ meta.label }}</span>
          <div v-if="topologyTaskLinks.length" class="topology-task-list">
            <strong>当前任务流向</strong>
            <span v-for="link in topologyTaskLinks" :key="link.id">
              <span>{{ formatTopologyEndpoint(link.sourceId) }}</span>
              <b>→</b>
              <span>{{ formatTopologyEndpoint(link.targetId) }}</span>
              <em>历史分发量 {{ link.traffic }}</em>
            </span>
          </div>
        </div>

        <div class="topology-canvas">
          <svg viewBox="0 0 640 360" role="img">
            <defs>
              <marker id="task-flow-arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="#ff4fd8" />
              </marker>
            </defs>
            <line class="topology-grid-line" x1="20" y1="180" x2="620" y2="180" />
            <line class="topology-grid-line" x1="320" y1="20" x2="320" y2="340" />
            <line
              v-for="link in topologyLinks"
              :key="link.id"
              :x1="link.source.x"
              :y1="link.source.y"
              :x2="link.target.x"
              :y2="link.target.y"
              :stroke-width="link.width"
              :stroke="link.color"
              :stroke-dasharray="link.dash"
              class="topology-link"
              :class="{ 'task-stream': link.link_type === 'task_stream' }"
              :marker-end="link.link_type === 'task_stream' ? 'url(#task-flow-arrow)' : null"
            />
            <line
              v-for="link in topologyTaskLinks"
              :key="`${link.id}-flow`"
              :x1="link.source.x"
              :y1="link.source.y"
              :x2="link.target.x"
              :y2="link.target.y"
              class="topology-task-flow"
            />
            <text
              v-for="link in topologyLinks.filter((item) => item.traffic > 0)"
              :key="`${link.id}-label`"
              :x="(link.source.x + link.target.x) / 2"
              :y="(link.source.y + link.target.y) / 2 - 8"
              class="link-label"
            >
              {{ link.link_type === 'task_stream' ? '任务流 →' : `${link.traffic_label} ${link.traffic}` }}
            </text>
            <g
              v-for="node in topologyNodes"
              :key="node.id"
              class="topology-node"
              :class="{ offline: !node.online }"
              @click="openNode(node.id)"
            >
              <title>{{ node.label }} · {{ node.orbit_layer }} · {{ node.load_label }}</title>
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="node.type === 'ground' ? 10 : 6"
                :fill="node.color"
              />
              <text v-if="node.type === 'ground'" :x="node.x" :y="node.y + 3">地</text>
              <text v-if="node.type === 'ground' || node.physical_node" :x="node.x" :y="node.y + 19" class="node-label">{{ node.id }}</text>
            </g>
          </svg>
        </div>
        <div class="topology-link-types">
          <span><i class="solid"></i>真实任务流 / 物理接入</span>
          <span><i class="dashed"></i>演示星地 / 星间链路</span>
        </div>
        </div>

        <div v-else-if="topologyView === 'dynamic'" class="embedded-topology-manager">
          <DynamicTopologyManager />
        </div>
        <div v-else class="embedded-topology-manager">
          <LinkStateManager compact />
        </div>
      </div>

      <div
        v-else-if="current.id === 'constellation'"
        class="module constellation-module"
      >
        <div class="summary-card constellation-summary">
          <span>星座分组配置</span>
          <strong>管理星座档案与卫星成员</strong>
          <p>星座是业务分组，不等同于轨道面。这里可以新建、编辑和删除星座，并调整每颗卫星所属的星座。</p>
        </div>
        <ConstellationGroupManager compact />
      </div>

      <div
        v-else-if="current.id === 'balance'"
        class="module balance-module"
      >
        <div class="balance-tabs" role="tablist" aria-label="负载均衡功能">
          <button
            type="button"
            role="tab"
            :aria-selected="balanceView === 'algorithm'"
            :class="{ active: balanceView === 'algorithm' }"
            @click="selectBalanceView('algorithm')"
          >
            <strong>算法调度</strong>
            <small>选择算法、配置参数并查看调度结果</small>
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="balanceView === 'load'"
            :class="{ active: balanceView === 'load' }"
            @click="selectBalanceView('load')"
          >
            <strong>节点负载</strong>
            <small>查看资源评分、六档负载和评分权重</small>
          </button>
        </div>

        <AlgorithmManager v-if="balanceView === 'algorithm'" compact />

        <template v-else>
        <div class="summary-card">
          <span>节点负载评分</span>
          <strong>{{ loadState.nodes.length }} 个实时负载节点</strong>
          <p>“综合负载”是调度用的加权分数；“资源告警”是单项 CPU、内存、磁盘或 NPU 越线的安全提示。两者判断方式不同，因此会同时显示。</p>
        </div>

        <div class="task-toolbar">
          <button type="button" :disabled="loadState.loading || lbState.loading" @click="refreshLoadModule">
            {{ loadState.loading || lbState.loading ? '刷新中...' : '刷新负载与策略' }}
          </button>
          <span>{{ formatLoadUpdateTime(loadState.updateTime) }}</span>
        </div>

        <div v-if="loadState.error" class="error-box">{{ loadState.error }}</div>

        <div class="load-level-legend">
          <span v-for="key in canonicalLoadLevelKeys" :key="key">
            <i :style="{ background: loadLevels[key].color }"></i>{{ loadLevels[key].label }}
          </span>
        </div>

        <div class="load-node-list">
          <button
            v-for="node in loadDisplayNodes"
            :key="`${node.node_id}-${node.physical_node}`"
            type="button"
            class="load-node-card"
            @click="openNode(node.node_id)"
          >
            <i :style="{ background: node.color }"></i>
            <span><strong>{{ node.node_id }}</strong><small>{{ node.physical_node || '未绑定物理节点' }}</small></span>
            <b>综合负载：{{ node.level_label || node.label }}<small>评分 {{ Number(node.score || 0).toFixed(1) }}</small></b>
            <b :class="['resource-alarm-text', node.resource_alarm_level]">资源：{{ formatResourceAlarm(node.resource_alarm_level) }}<small>{{ node.resource_alarm_reason }}</small></b>
          </button>
          <div v-if="!loadState.nodes.length && !loadState.loading" class="empty-box">暂无负载节点</div>
        </div>

        <section class="threshold-section">
          <div class="section-heading">
            <div><strong>负载评分阈值</strong><small>版本 {{ thresholdDraft.version || '-' }}</small></div>
            <button type="button" :disabled="loadState.loadingThresholds" @click="reloadThresholds">重新读取</button>
          </div>
          <div v-if="loadState.thresholdsError" class="error-box">{{ loadState.thresholdsError }}</div>
          <div v-if="loadState.actionMessage" class="success-box">{{ loadState.actionMessage }}</div>
          <template v-if="thresholdDraft.score_levels.length">
            <div class="threshold-levels">
              <label v-for="level in thresholdDraft.score_levels" :key="level.level">
                <span :style="{ color: loadLevels[level.level]?.color }">{{ level.label }}</span>
                <input v-model.number="level.min" type="number" min="0" max="100" step="1" />
                <em>至</em>
                <input v-model.number="level.max" type="number" min="0" max="101" step="1" />
              </label>
            </div>
            <div class="threshold-subtitle">评分权重（总和必须为 1）</div>
            <div class="threshold-grid">
              <label v-for="item in weightFields" :key="item.key">
                <span>{{ item.label }}</span>
                <input v-model.number="thresholdDraft.weights[item.key]" type="number" min="0" max="1" step="0.01" />
              </label>
            </div>
            <div class="threshold-subtitle">队列与可用性</div>
            <div class="threshold-grid">
              <label><span>队列容量</span><input v-model.number="thresholdDraft.queue_capacity" type="number" min="1" step="1" /></label>
              <label><span>离线惩罚</span><input v-model.number="thresholdDraft.availability_penalty.offline" type="number" min="0" max="100" /></label>
              <label><span>未就绪惩罚</span><input v-model.number="thresholdDraft.availability_penalty.not_ready" type="number" min="0" max="100" /></label>
              <label><span>就绪惩罚</span><input v-model.number="thresholdDraft.availability_penalty.ready" type="number" min="0" max="100" /></label>
            </div>
            <div class="threshold-subtitle">缺失指标处理</div>
            <div class="threshold-grid">
              <label><span>NPU 缺失</span><select v-model="thresholdDraft.metric_fill.missing_npu_strategy"><option value="ignore_and_renormalize">忽略并重算权重</option><option value="zero">按 0 计算</option></select></label>
              <label><span>普通指标缺失</span><select v-model="thresholdDraft.metric_fill.missing_metric_strategy"><option value="ignore_and_renormalize">忽略并重算权重</option><option value="zero">按 0 计算</option></select></label>
            </div>
            <button class="threshold-save" type="button" :disabled="loadState.savingThresholds" @click="saveThresholdDraft">
              {{ loadState.savingThresholds ? '保存中...' : '保存负载阈值' }}
            </button>
          </template>
          <div v-else class="empty-box">{{ loadState.loadingThresholds ? '正在读取阈值...' : '暂未读取到阈值配置' }}</div>
        </section>

        <div class="info-list">
          <div>
            <span>Dispatcher 镜像</span>
            <strong>{{ lbState.current?.dispatcher_image || '-' }}</strong>
          </div>
          <div>
            <span>Kubernetes</span>
            <strong>{{ lbState.current?.k8s?.available === false ? '异常' : '可用' }}</strong>
          </div>
          <div>
            <span>错误信息</span>
            <strong>{{ lbState.current?.k8s?.error || '-' }}</strong>
          </div>
        </div>
        </template>
      </div>

      <div
        v-else
        class="module"
      >
        <div class="summary-card">
          <span>{{ fallbackContent[current.id].label }}</span>
          <strong>{{ fallbackContent[current.id].title }}</strong>
          <p>{{ fallbackContent[current.id].desc }}</p>
        </div>

        <label
          v-if="current.id === 'ephemeris'"
          class="file-drop"
        >
          <input type="file" />
          <span>拖入或选择星历文件</span>
          <small>支持 .tle / .json / .txt</small>
        </label>
      </div>
    </div>
  </section>
</template>

<script>
import { computed, reactive, ref, watch } from 'vue'
import { useTaskStore } from '@/store/taskStore'
import { useLoadStore } from '@/store/loadStore'
import { TOPOLOGY_TRAFFIC_META, useTopologyStore } from '@/store/topologyStore'
import { useLoadBalanceStore } from '@/store/loadBalanceStore'
import { useNodeStore } from '@/store/nodeStore'
import { useConstellationStore } from '@/store/constellationStore'
import { useNodeModelStore } from '@/store/nodeModelStore'
import { useResourceStore } from '@/store/resourceStore'
import AlgorithmManager from '@/components/loadBalance/AlgorithmManager.vue'
import ConstellationGroupManager from '@/components/constellation/ConstellationGroupManager.vue'
import DynamicTopologyManager from '@/components/topology/DynamicTopologyManager.vue'
import LinkStateManager from '@/components/topology/LinkStateManager.vue'
import { useConstellationGroupStore } from '@/store/constellationGroupStore'

const fallbackContent = {
  ephemeris: {
    label: '星历源',
    title: 'TLE / JSON',
    desc: '导入真实星历后，可替换当前模拟轨道并刷新轨道预测。'
  },
  node: {
    label: '节点目录',
    title: '星地一体网络',
    desc: '节点列表已由 /api/nodes 在启动阶段获取，并用于地球渲染。'
  },
  business: {
    label: '任务流',
    title: '业务承载策略',
    desc: '选择业务类型后，可用于后续链路规划与负载调度。'
  },
  physical: {
    label: '半物理接入',
    title: '真实设备桥接',
    desc: '用于接入实验设备、仿真节点或外部遥测数据源。'
  },
  balance: {
    label: '负载策略',
    title: '动态调度',
    desc: '根据链路质量、节点资源和任务优先级进行路径选择。'
  },
  topology: {
    label: '二维拓扑',
    title: '链路关系视图',
    desc: '在平面视图中检查星间链路、业务路径和拥塞区域。'
  }
}

export default {
  name: 'FunctionPanel',
  components: {
    AlgorithmManager,
    ConstellationGroupManager,
    DynamicTopologyManager,
    LinkStateManager
  },
  emits: ['close', 'node-click', 'node-filter'],
  props: {
    current: {
      type: Object,
      default: null
    }
  },
  setup(props, { emit }) {
    const nodeDirectoryLoading = ref(false)
    const nodeDirectoryLocalError = ref('')
    const nodeLayerFilter = ref('')
    const nodeConstellationFilter = ref('')
    const nodeStatusFilter = ref('')
    const nodeNameKeyword = ref('')
    const appliedNodeLayer = ref('')
    const appliedNodeConstellation = ref('')
    const appliedNodeStatus = ref('')
    const appliedNodeKeyword = ref('')
    const syncOverwrite = ref(false)
    const syncBindDemoWorkers = ref(true)
    const topologyTimeIndex = ref(0)
    const topologyOrbitLayer = ref('')
    const topologyConstellationId = ref('')
    const topologyIncludeSimulated = ref(true)
    const topologyView = ref('map')
    const poolLayers = ['GROUND', 'LEO', 'MEO', 'HEO']
    const validIpv6PoolDefaults = {
      GROUND: 'fd00:310:0::/48',
      LEO: 'fd00:310:1::/48',
      MEO: 'fd00:310:2::/48',
      HEO: 'fd00:310:3::/48'
    }
    const poolDraft = reactive(Object.fromEntries(
      poolLayers.map((layer) => [layer, { ipv4_cidr: '', ipv6_cidr: '' }])
    ))
    const bindingDraft = reactive({
      node_id: '',
      physical_node: '',
      physical_ipv4: '',
      binding_role: 'edge-worker'
    })
    const operationNotice = reactive({ message: '', type: 'success' })
    const balanceView = ref('algorithm')
    const canonicalLoadLevelKeys = ['idle', 'smooth', 'normal', 'light', 'medium', 'heavy', 'offline']
    const weightFields = [
      { key: 'cpu_percent', label: 'CPU' },
      { key: 'memory_percent', label: '内存' },
      { key: 'disk_root_percent', label: '磁盘' },
      { key: 'npu_ai_core_percent', label: 'NPU AI Core' },
      { key: 'npu_memory_percent', label: 'NPU 内存' },
      { key: 'task_queue_percent', label: '任务队列' },
      { key: 'availability_penalty', label: '可用性惩罚' }
    ]
    const thresholdDraft = reactive({
      version: 1,
      score_levels: [],
      weights: {},
      queue_capacity: 20,
      availability_penalty: { offline: 100, not_ready: 80, ready: 0 },
      metric_fill: {
        missing_npu_strategy: 'ignore_and_renormalize',
        missing_metric_strategy: 'ignore_and_renormalize'
      }
    })
    const { state: taskState, fetchJobs, selectJob } = useTaskStore()
    const {
      state: loadState,
      levels: loadLevels,
      fetchLoadStatus,
      fetchLoadThresholds,
      saveLoadThresholds,
      getLoadByNodeId
    } = useLoadStore()
    const { state: nodeState, fetchNodes } = useNodeStore()
    const {
      state: constellationState,
      setComputeNodes,
      initializeConstellation,
      refreshConstellationNodes
    } = useConstellationStore()
    const {
      state: constellationGroupState,
      fetchGroups: fetchConstellationGroups
    } = useConstellationGroupStore()
    const {
      state: nodeModelState,
      fetchManagementData,
      synchronizeModels,
      savePool,
      saveBinding,
      removeBinding
    } = useNodeModelStore()
    const {
      state: resourceState,
      fetchResourceService,
      fetchNodeResources,
      getResourceByNode
    } = useResourceStore()
    const {
      state: topologyState,
      fetchTopology
    } = useTopologyStore()
    const {
      state: lbState,
      fetchLoadBalance
    } = useLoadBalanceStore()

    const closePanel = () => {
      emit('close')
    }

    const loadJobs = async () => {
      try {
        await fetchJobs(20)
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || '读取任务列表失败'
      }
    }

    const openJob = async (jobId) => {
      try {
        await selectJob(jobId)
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || '读取任务详情失败'
      }
    }

    const loadNodeDirectory = async () => {
      if (nodeDirectoryLoading.value) return
      nodeDirectoryLoading.value = true
      nodeDirectoryLocalError.value = ''

      try {
        const constellationRequest = constellationState.nodes.length
          ? refreshConstellationNodes()
          : initializeConstellation()
        const [computeNodes] = await Promise.all([
          fetchNodes(),
          constellationRequest,
          fetchConstellationGroups().catch(() => null),
          fetchManagementData(),
          fetchNodeResources().catch(() => null),
          fetchLoadStatus().catch(() => null)
        ])
        setComputeNodes(computeNodes)
      } catch (error) {
        nodeDirectoryLocalError.value = error?.message || '刷新网络节点目录失败'
      } finally {
        nodeDirectoryLoading.value = false
      }
    }

    const openNode = (nodeId) => emit('node-click', nodeId)
    const openLoadNode = (loadNode) => {
      const model = nodeModelState.models.find((item) => (
        item.node_id === loadNode.node_id ||
        (loadNode.physical_node && item.physical_node === loadNode.physical_node)
      ))
      openNode(model?.node_id || loadNode.node_id)
    }

    const resourceTargets = computed(() => resourceState.status?.node_exporter_targets || [])
    const npuCollectorTargets = computed(() => resourceState.status?.npu_collectors || [])
    const resourceOnlineTargetCount = computed(() => (
      resourceTargets.value.filter((target) => target.up === true).length
    ))
    const resourceServiceStatusText = computed(() => {
      if (resourceState.loadingStatus && !resourceState.status) return '正在检测资源服务...'
      if (!resourceState.status || resourceState.status.ready === null || resourceState.status.ready === undefined) {
        return '资源服务状态未知'
      }
      return resourceState.status.ready ? 'Prometheus 服务正常' : '资源服务未就绪'
    })

    const refreshResourceService = async () => {
      try {
        await Promise.all([fetchResourceService(), fetchNodeResources()])
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || '刷新资源监控状态失败'
      }
    }

    const formatResourcePercent = (value) => {
      if (value === null || value === undefined || value === '') return '未采集'
      const percent = Number(value)
      return Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '未采集'
    }

    const formatTargetStatus = (value) => {
      if (value === null || value === undefined) return '状态未知'
      return value ? '在线' : '离线'
    }

    const formatResourceAlarm = (value) => ({
      normal: '正常',
      warning: '告警',
      critical: '严重告警',
      offline: '离线'
    })[value] || '状态未知'

    const formatResourceUpdateTime = (value) => {
      if (!value) return '尚未更新'
      const rawValue = typeof value === 'number' && value < 1000000000000 ? value * 1000 : value
      const date = new Date(rawValue)
      return Number.isNaN(date.getTime())
        ? '更新时间未知'
        : `更新于 ${date.toLocaleTimeString('zh-CN', { hour12: false })}`
    }

    const loadTopology = async () => {
      try {
        await fetchTopology({
          timeIndex: topologyTimeIndex.value,
          orbitLayer: topologyOrbitLayer.value,
          constellationId: topologyConstellationId.value,
          includeSimulatedLinks: topologyIncludeSimulated.value
        })
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || '读取网络拓扑失败'
      }
    }

    const formatNpuAvailability = (resource) => {
      if (!resource?.npu_expected) return '未配置'
      if (resource.npu_metrics_available !== true) return '不可用'
      if (resource.npu_metrics_stale) return '数据过期'
      return `${formatResourcePercent(resource.npu_ai_core_percent)} AI Core`
    }

    const loadDisplayNodes = computed(() => loadState.nodes.map((node) => {
      const resource = getResourceByNode(node.node_id, node.physical_node)
      let reason = '各项资源未越线'
      if (resource?.online === false) reason = '节点离线'
      else if (resource?.npu_expected && resource?.npu_metrics_available !== true) reason = 'NPU 指标不可用'
      else if (resource?.npu_metrics_stale) reason = 'NPU 指标已过期'
      else {
        const entries = [
          ['CPU', resource?.cpu_percent],
          ['内存', resource?.memory_percent],
          ['磁盘', resource?.disk_root_percent],
          ['NPU', resource?.npu_ai_core_percent]
        ].filter(([, value]) => Number.isFinite(Number(value)))
        const peak = entries.sort((left, right) => Number(right[1]) - Number(left[1]))[0]
        if (peak && Number(peak[1]) >= 75) reason = `${peak[0]} ${Number(peak[1]).toFixed(1)}%`
      }
      return {
        ...node,
        resource_alarm_level: resource?.alarm_level || 'unknown',
        resource_alarm_reason: resource ? reason : '暂无资源数据'
      }
    }))

    const selectTopologyView = (view) => {
      topologyView.value = view
      if (view === 'map' && topologyState.nodes.length === 0 && !topologyState.loading) {
        loadTopology()
      }
    }

    const loadBalance = async () => {
      try {
        await fetchLoadBalance()
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || '读取负载均衡状态失败'
      }
    }

    const refreshLoadModule = async () => {
      operationNotice.message = ''
      const results = await Promise.allSettled([
        fetchLoadStatus(),
        fetchLoadThresholds(),
        fetchLoadBalance()
      ])
      const failure = results.find((result) => result.status === 'rejected')
      if (failure) {
        operationNotice.type = 'error'
        operationNotice.message = failure.reason?.message || '刷新负载状态失败'
      }
    }

    const selectBalanceView = (view) => {
      balanceView.value = view
      if (view === 'load' && !loadState.loading) {
        refreshLoadModule()
      }
    }

    const reloadThresholds = async () => {
      try {
        await fetchLoadThresholds()
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || '读取负载阈值失败'
      }
    }

    const validateThresholdDraft = () => {
      const levels = thresholdDraft.score_levels
      if (levels.length !== 6) return '必须保留空闲、流畅、正常、轻度、中度、重度六个评分区间'
      for (let index = 0; index < levels.length; index += 1) {
        const current = levels[index]
        if (!Number.isFinite(Number(current.min)) || !Number.isFinite(Number(current.max)) || Number(current.min) >= Number(current.max)) {
          return `${current.label}的评分范围无效`
        }
        if (index > 0 && Number(levels[index - 1].max) !== Number(current.min)) {
          return `${levels[index - 1].label}与${current.label}的区间必须首尾相接`
        }
      }
      if (Number(levels[0].min) !== 0 || Number(levels[levels.length - 1].max) < 100) {
        return '六档评分区间必须完整覆盖 0–100'
      }
      const weights = weightFields.map(({ key }) => Number(thresholdDraft.weights[key]))
      if (weights.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) return '评分权重必须在 0–1 之间'
      const weightTotal = weights.reduce((total, value) => total + value, 0)
      if (Math.abs(weightTotal - 1) > 0.001) return `评分权重总和应为 1，当前为 ${weightTotal.toFixed(3)}`
      if (!Number.isFinite(Number(thresholdDraft.queue_capacity)) || Number(thresholdDraft.queue_capacity) < 1) return '队列容量必须大于 0'
      return ''
    }

    const saveThresholdDraft = async () => {
      const validationError = validateThresholdDraft()
      if (validationError) {
        operationNotice.type = 'error'
        operationNotice.message = validationError
        return
      }
      try {
        const draft = JSON.parse(JSON.stringify(thresholdDraft))
        delete draft.version
        await saveLoadThresholds(draft)
        operationNotice.type = 'success'
        operationNotice.message = '负载评分阈值保存成功'
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || '保存负载阈值失败'
      }
    }

    const formatLoadUpdateTime = (value) => {
      if (!value) return '尚未更新'
      const raw = typeof value === 'number' && value < 1e12 ? value * 1000 : value
      const date = new Date(raw)
      return Number.isNaN(date.getTime())
        ? '更新时间未知'
        : date.toLocaleTimeString('zh-CN', { hour12: false })
    }

    const formatLayer = (layer) => ({
      GROUND: '地面层 GROUND',
      LEO: '低轨层 LEO',
      MEO: '中轨层 MEO',
      HEO: '高轨层 HEO'
    })[layer] || layer

    const hasInvalidBackendIpv6Pools = computed(() => poolLayers.some((layer) => (
      /:(ground|leo|meo|heo):/i.test(nodeModelState.pools?.[layer]?.ipv6_cidr || '')
    )))

    const repairIpv6Pools = async () => {
      if (!window.confirm('将把四层 IPv6 地址池替换为合法网段，随后需要覆盖同步节点模型。确定继续吗？')) return
      try {
        for (const layer of poolLayers) {
          const ipv4Cidr = nodeModelState.pools?.[layer]?.ipv4_cidr || poolDraft[layer].ipv4_cidr
          await savePool(layer, ipv4Cidr, validIpv6PoolDefaults[layer])
        }
        poolLayers.forEach((layer) => {
          poolDraft[layer].ipv6_cidr = validIpv6PoolDefaults[layer]
        })
        syncOverwrite.value = true
        nodeModelState.actionMessage = 'IPv6 地址池已修复，请继续点击“从星历同步节点模型”'
      } catch (_) {
        // 后端返回的具体错误由节点模型状态显示。
      }
    }

    const syncModelsNow = async () => {
      if (hasInvalidBackendIpv6Pools.value) {
        nodeDirectoryLocalError.value = '请先点击“修复并保存四层 IPv6 地址池”，再执行节点模型同步'
        return
      }
      if (syncOverwrite.value && !window.confirm('覆盖同步可能替换已经修改的节点名称、IP和绑定，确定继续吗？')) {
        return
      }
      try {
        await synchronizeModels({
          overwrite: syncOverwrite.value,
          bindDemoWorkers: syncBindDemoWorkers.value
        })
        await loadNodeDirectory()
      } catch (_) {
        // 接口错误由节点模型状态统一显示。
      }
    }

    const savePoolDraft = async (layer) => {
      const draft = poolDraft[layer]
      try {
        await savePool(layer, draft.ipv4_cidr, draft.ipv6_cidr)
      } catch (_) {
        // 接口错误由节点模型状态统一显示。
      }
    }

    const saveBindingDraft = async () => {
      if (!bindingDraft.node_id || !bindingDraft.physical_node || !bindingDraft.physical_ipv4) {
        nodeDirectoryLocalError.value = '请选择逻辑节点和物理节点'
        operationNotice.type = 'error'
        operationNotice.message = '请选择要绑定的逻辑节点和物理节点'
        return
      }
      try {
        operationNotice.message = ''
        await fetchManagementData()
        const occupiedBindings = nodeModelState.bindings.filter((binding) => (
          binding.physical_node === bindingDraft.physical_node &&
          binding.node_id !== bindingDraft.node_id
        ))
        if (occupiedBindings.length) {
          const occupiedNodeIds = occupiedBindings.map((binding) => binding.node_id).join('、')
          const shouldSwitch = window.confirm(
            `物理节点 ${bindingDraft.physical_node} 当前已绑定 ${occupiedNodeIds}，是否解除原绑定并切换到 ${bindingDraft.node_id}？`
          )
          if (!shouldSwitch) return
          for (const binding of occupiedBindings) {
            await removeBinding(binding.node_id)
          }
        }
        const targetNodeId = bindingDraft.node_id
        const targetPhysicalNode = bindingDraft.physical_node
        const targetPhysicalIpv4 = bindingDraft.physical_ipv4
        await saveBinding({
          node_id: targetNodeId,
          physical_node: targetPhysicalNode,
          physical_ipv4: targetPhysicalIpv4,
          binding_role: bindingDraft.binding_role || 'edge-worker'
        })
        await Promise.all([fetchManagementData(), fetchNodes()])
        const confirmedBinding = nodeModelState.bindings.find((binding) => (
          binding.node_id === targetNodeId &&
          binding.physical_node === targetPhysicalNode
        ))
        if (!confirmedBinding) {
          throw new Error('后端未返回新的绑定关系，请稍后重试')
        }
        operationNotice.type = 'success'
        operationNotice.message = `${targetNodeId} 已成功绑定 ${targetPhysicalNode}（${targetPhysicalIpv4}）`
        bindingDraft.node_id = ''
        bindingDraft.physical_node = ''
        bindingDraft.physical_ipv4 = ''
        bindingDraft.binding_role = 'edge-worker'
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || nodeModelState.error || '保存物理节点绑定失败'
      }
    }

    const physicalNodeOptions = computed(() => {
      const nodes = new Map()
      nodeState.nodes.forEach((node) => {
        if (!node.physical_node) return
        nodes.set(node.physical_node, {
          physical_node: node.physical_node,
          physical_ipv4: node.ipv4 || '',
          online: node.online
        })
      })
      nodeModelState.bindings.forEach((binding) => {
        if (!binding?.physical_node) return
        const current = nodes.get(binding.physical_node) || {
          physical_node: binding.physical_node,
          physical_ipv4: binding.physical_ipv4 || '',
          online: null
        }
        nodes.set(binding.physical_node, {
          ...current,
          physical_ipv4: current.physical_ipv4 || binding.physical_ipv4 || '',
          bound_node_id: binding.node_id
        })
      })
      return [...nodes.values()].sort((left, right) => (
        String(left.physical_node || '').localeCompare(String(right.physical_node || ''))
      ))
    })

    const selectedPhysicalBinding = computed(() => nodeModelState.bindings.find((binding) => (
      binding?.physical_node && binding.physical_node === bindingDraft.physical_node
    )) || null)

    watch(
      () => bindingDraft.physical_node,
      (physicalNode) => {
        const selected = physicalNodeOptions.value.find((node) => node.physical_node === physicalNode)
        bindingDraft.physical_ipv4 = selected?.physical_ipv4 || ''
      }
    )

    watch(
      () => bindingDraft.node_id,
      (nodeId) => {
        const binding = nodeModelState.bindings.find((item) => item.node_id === nodeId)
        bindingDraft.physical_node = binding?.physical_node || ''
        bindingDraft.physical_ipv4 = binding?.physical_ipv4 || ''
        bindingDraft.binding_role = binding?.binding_role || 'edge-worker'
      }
    )

    const removeBindingNow = async (nodeId) => {
      if (!window.confirm(`确定解除 ${nodeId} 的物理节点绑定吗？`)) return
      try {
        await removeBinding(nodeId)
        await fetchManagementData()
        operationNotice.type = 'success'
        operationNotice.message = `${nodeId} 的物理节点绑定已解除`
      } catch (error) {
        operationNotice.type = 'error'
        operationNotice.message = error?.message || nodeModelState.error || '解除物理节点绑定失败'
      }
    }

    watch(
      () => nodeModelState.pools,
      (pools) => {
        poolLayers.forEach((layer) => {
          poolDraft[layer].ipv4_cidr = pools?.[layer]?.ipv4_cidr || ''
          poolDraft[layer].ipv6_cidr = pools?.[layer]?.ipv6_cidr || ''
        })
      },
      { immediate: true, deep: true }
    )

    watch(
      () => loadState.thresholds,
      (thresholds) => {
        if (!thresholds) return
        const copy = JSON.parse(JSON.stringify(thresholds))
        thresholdDraft.version = copy.version ?? 1
        thresholdDraft.score_levels = Array.isArray(copy.score_levels) ? copy.score_levels : []
        thresholdDraft.weights = copy.weights || {}
        thresholdDraft.queue_capacity = copy.queue_capacity ?? 20
        thresholdDraft.availability_penalty = copy.availability_penalty || { offline: 100, not_ready: 80, ready: 0 }
        thresholdDraft.metric_fill = copy.metric_fill || {
          missing_npu_strategy: 'ignore_and_renormalize',
          missing_metric_strategy: 'ignore_and_renormalize'
        }
      },
      { immediate: true, deep: true }
    )

    const manifest = computed(() => taskState.jobDetail?.manifest || {})
    const scheduling = computed(() => manifest.value?.scheduling || {})
    const visibleTiles = computed(() => taskState.tiles.slice(0, 12))
    const getDirectoryLayer = (node) => {
      if (node.type === 'ground') return 'GROUND'
      const layer = String(node.orbit_layer || node.orbit || '').toUpperCase()
      if (['LEO', 'MEO', 'HEO'].includes(layer)) return layer
      const prefix = String(node.node_id || '').charAt(0).toUpperCase()
      return ({ L: 'LEO', M: 'MEO', H: 'HEO' })[prefix] || ''
    }
    const allNodeDirectory = computed(() => {
      const groupByNodeId = new Map()
      constellationGroupState.groups.forEach((group) => {
        const members = group.members || []
        members.forEach((nodeId) => {
          groupByNodeId.set(String(nodeId), {
            constellation_id: group.constellation_id,
            constellation_name: group.constellation_name
          })
        })
      })
      const constellationById = new Map(
        constellationState.nodes.map((node) => [node.node_id, node])
      )
      const consumedRuntimeIds = new Set()
      const records = nodeModelState.models.map((model) => {
        const runtime = nodeState.nodes.find((node) => (
          node.node_id === model.node_id ||
          (model.physical_node && node.physical_node === model.physical_node)
        ))
        if (runtime) consumedRuntimeIds.add(runtime.node_id)
        const resource = model.physical_node
          ? getResourceByNode(model.node_id, model.physical_node)
          : null
        const load = model.physical_node
          ? getLoadByNodeId(model.node_id, model.physical_node)
          : null
        const constellation = constellationById.get(model.node_id) || {}
        constellationById.delete(model.node_id)
        return {
          ...constellation,
          ...model,
          ...(runtime || {}),
          node_id: model.node_id,
          node_name: model.node_name,
          node_type: model.node_type,
          orbit_layer: model.orbit_layer,
          constellation: model.constellation,
          plane_id: model.plane_id,
          satellite_index: model.satellite_index,
          logical_ipv4: model.logical_ipv4,
          logical_ipv6: model.logical_ipv6,
          physical_node: model.physical_node,
          physical_ipv4: model.physical_ipv4,
          binding_role: model.binding_role,
          online: resource?.online ?? runtime?.online ?? model.status?.online ?? null,
          worker_ready: resource?.worker_ready ?? runtime?.worker_ready ?? model.status?.worker_ready ?? null,
          task_queue_len: resource?.task_queue_len ?? runtime?.task_queue_len ?? null,
          load: load || runtime?.load || model.load,
          resource_metrics: resource,
          alarm_level: resource?.alarm_level || null,
          has_node_model: true
        }
      })

      constellationById.forEach((node) => records.push(node))
      nodeState.nodes
        .filter((node) => !consumedRuntimeIds.has(node.node_id) && (
          !records.some((record) => record.node_id === node.node_id)
        ))
        .forEach((node) => records.push(node))

      resourceState.nodes.forEach((resource) => {
        const resourceNodeId = resource.node_id || resource.logical_node_id || resource.physical_node
        if (!resourceNodeId) return
        const resourcePhysicalIds = [
          resource.physical_node,
          resource.physical_node_id,
          resource.worker_node,
          resource.node
        ].filter(Boolean).map(String)
        const alreadyIncluded = records.some((record) => (
          record.resource_metrics === resource ||
          record.node_id === resourceNodeId ||
          (record.physical_node && String(record.physical_node) === String(resourceNodeId)) ||
          resourcePhysicalIds.includes(String(record.node_id || '')) ||
          resourcePhysicalIds.includes(String(record.physical_node || ''))
        ))
        if (!alreadyIncluded) {
          records.push({
            ...resource,
            node_id: resourceNodeId,
            resource_metrics: resource,
            alarm_level: resource.alarm_level || null
          })
        }
      })

      return records.map((node) => {
        const mayUseResource = !node.has_node_model || Boolean(node.physical_node)
        const resource = node.resource_metrics || (mayUseResource
          ? getResourceByNode(node.node_id, node.physical_node)
          : null)
        const physicalNode = node.physical_node || resource?.physical_node ||
          resource?.physical_node_id || resource?.worker_node || resource?.node || ''
        const normalizedNode = {
          ...node,
          physical_node: physicalNode,
          physical_ipv4: resource?.physical_ipv4 || node.physical_ipv4,
          online: resource?.online ?? node.online,
          worker_ready: resource?.worker_ready ?? node.worker_ready,
          task_queue_len: resource?.task_queue_len ?? node.task_queue_len,
          resource_metrics: resource,
          alarm_level: resource?.alarm_level || node.alarm_level || null,
          load: getLoadByNodeId(node.node_id, physicalNode) || node.load || null
        }
        const constellationGroup = groupByNodeId.get(String(normalizedNode.node_id || ''))
        const layer = getDirectoryLayer(normalizedNode)
        const isGround = layer === 'GROUND'
        const layerLabel = ({
          GROUND: '地面节点',
          LEO: '低轨',
          MEO: '中轨',
          HEO: '高轨'
        })[layer] || '节点'
        const binding = normalizedNode.physical_node ? `绑定 ${normalizedNode.physical_node}` : '未绑定物理节点'
        const logicalIp = normalizedNode.logical_ipv4 ? ` · ${normalizedNode.logical_ipv4}` : ''
        const rawCpuPercent = normalizedNode.resource_metrics?.cpu_percent
        const cpuPercent = rawCpuPercent === null || rawCpuPercent === undefined || rawCpuPercent === ''
          ? Number.NaN
          : Number(rawCpuPercent)
        const alarmLabel = ({
          normal: '正常',
          warning: '告警',
          critical: '严重',
          offline: '离线'
        })[normalizedNode.alarm_level] || '未知'
        const resourceExtra = normalizedNode.load
          ? `负载 ${Number(normalizedNode.load.score || 0).toFixed(1)} · ${normalizedNode.load.level_label || normalizedNode.load.label}`
          : (Number.isFinite(cpuPercent) ? `CPU ${cpuPercent.toFixed(1)}% · ${alarmLabel}` : null)
        const rawAltitude = normalizedNode.avg_altitude_km
        const hasAltitude = rawAltitude !== null && rawAltitude !== undefined && rawAltitude !== '' &&
          Number.isFinite(Number(rawAltitude))
        return {
          ...normalizedNode,
          type: normalizedNode.node_type || normalizedNode.type,
          directoryLayer: layer,
          directoryConstellationId: constellationGroup?.constellation_id || normalizedNode.constellation_id || '',
          directoryConstellationName: constellationGroup?.constellation_name || normalizedNode.constellation_name || '',
          directoryLabel: layerLabel,
          directoryDescription: normalizedNode.node_name
            ? `${normalizedNode.node_name}${constellationGroup?.constellation_name ? ` · ${constellationGroup.constellation_name}` : ''} · ${binding}${logicalIp}`
            : `${constellationGroup?.constellation_name ? `${constellationGroup.constellation_name} · ` : ''}${binding}${logicalIp}`,
          directoryExtra: resourceExtra || (hasAltitude
            ? `${Number(normalizedNode.avg_altitude_km).toFixed(1)} km`
            : `${normalizedNode.online === true ? '在线' : (normalizedNode.online === false ? '离线' : '状态未知')} · ${binding}`),
          directoryColor: normalizedNode.load?.color || ({
            critical: '#ff4d6d',
            warning: '#ffb84d',
            offline: '#62717d'
          })[normalizedNode.alarm_level] || (isGround
            ? '#52c4ff'
            : (layer === 'HEO' ? '#ffb657' : (layer === 'MEO' ? '#38ffb7' : '#9b8cff')))
        }
      })
    })
    const nodeDirectory = computed(() => {
      const keyword = appliedNodeKeyword.value.toLowerCase()
      return allNodeDirectory.value.filter((node) => {
        if (appliedNodeLayer.value && node.directoryLayer !== appliedNodeLayer.value) return false
        if (
          appliedNodeConstellation.value === '__unassigned__' &&
          (node.directoryLayer === 'GROUND' || node.directoryConstellationId)
        ) return false
        if (
          appliedNodeConstellation.value &&
          appliedNodeConstellation.value !== '__unassigned__' &&
          node.directoryConstellationId !== appliedNodeConstellation.value
        ) return false
        if (appliedNodeStatus.value === 'online' && node.online !== true) return false
        if (appliedNodeStatus.value === 'offline' && node.online !== false) return false
        if (!keyword) return true
        return [
          node.node_id,
          node.node_name,
          node.physical_node,
          node.compute_node_id,
          node.directoryConstellationName,
          node.constellation_type,
          node.role
        ].some((value) => String(value || '').toLowerCase().includes(keyword))
      })
    })
    const applyNodeFilter = () => {
      appliedNodeLayer.value = nodeLayerFilter.value
      appliedNodeConstellation.value = nodeConstellationFilter.value
      appliedNodeStatus.value = nodeStatusFilter.value
      appliedNodeKeyword.value = nodeNameKeyword.value.trim()
      emit('node-filter', {
        layer: appliedNodeLayer.value,
        constellationId: appliedNodeConstellation.value,
        status: appliedNodeStatus.value,
        keyword: appliedNodeKeyword.value,
        nodeIds: nodeDirectory.value.map((node) => node.node_id)
      })
    }
    const resetNodeFilter = () => {
      nodeLayerFilter.value = ''
      nodeConstellationFilter.value = ''
      nodeStatusFilter.value = ''
      nodeNameKeyword.value = ''
      applyNodeFilter()
    }
    const nodeDirectoryError = computed(() => (
      nodeDirectoryLocalError.value || nodeModelState.error || nodeState.error || constellationState.error
    ))
    const constellationFilterOptions = computed(() => constellationGroupState.groups)
    const leoNodeCount = computed(() => (
      allNodeDirectory.value.filter((node) => node.directoryLayer === 'LEO').length
    ))
    const meoNodeCount = computed(() => (
      allNodeDirectory.value.filter((node) => node.directoryLayer === 'MEO').length
    ))
    const heoNodeCount = computed(() => (
      allNodeDirectory.value.filter((node) => node.directoryLayer === 'HEO').length
    ))
    const rawTopologyNodes = computed(() => {
      return topologyState.nodes.map((node) => {
        const isGround = node.type === 'ground'
        const longitude = Number(node.layout?.x ?? node.x ?? node.geo?.lon_deg ?? 0)
        const latitude = Number(node.layout?.y ?? node.y ?? node.geo?.lat_deg ?? 0)
        const x = 30 + ((Math.max(-180, Math.min(180, longitude)) + 180) / 360) * 580
        const y = 30 + ((90 - Math.max(-90, Math.min(90, latitude))) / 180) * 300
        const load = getLoadByNodeId(node.id || node.node_id, node.physical_node)
        const loadLevel = load?.level || node.load?.level || node.status?.load_level || node.load_level
        const offline = node.online === false
        return {
          ...node,
          x,
          y,
          short: isGround ? '地' : '星',
          load_level: loadLevel,
          load_label: load?.label || node.load?.label || node.status?.load_label || loadLevels[loadLevel]?.label || '状态未知',
          color: offline ? '#9e9e9e' : (load?.color || loadLevels[loadLevel]?.color || '#52c4ff')
        }
      })
    })
    const topologyNodes = computed(() => {
      const orbitLayer = String(topologyOrbitLayer.value || '').toUpperCase()
      const constellationId = topologyConstellationId.value
      if (!orbitLayer && !constellationId) return rawTopologyNodes.value

      const selectedGroup = constellationGroupState.groups.find(
        (group) => group.constellation_id === constellationId
      )
      const memberIds = new Set((selectedGroup?.members || []).map(String))
      const selectedSatelliteIds = new Set(rawTopologyNodes.value
        .filter((node) => {
          if (node.type === 'ground' || node.node_type === 'ground') return false
          const nodeLayer = String(node.orbit_layer || '').toUpperCase() || ({ L: 'LEO', M: 'MEO', H: 'HEO' })[String(node.id || '').charAt(0).toUpperCase()]
          if (orbitLayer && nodeLayer !== orbitLayer) return false
          if (constellationId && !memberIds.has(String(node.id || node.node_id || ''))) return false
          return true
        })
        .map((node) => String(node.id || node.node_id || '')))

      if (!selectedSatelliteIds.size) return []
      const connectedGroundIds = new Set()
      topologyState.links.forEach((link) => {
        const source = String(link.source || '')
        const target = String(link.target || '')
        if (selectedSatelliteIds.has(source)) connectedGroundIds.add(target)
        if (selectedSatelliteIds.has(target)) connectedGroundIds.add(source)
      })
      return rawTopologyNodes.value.filter((node) => {
        const id = String(node.id || node.node_id || '')
        return selectedSatelliteIds.has(id) || (
          (node.type === 'ground' || node.node_type === 'ground') && connectedGroundIds.has(id)
        )
      })
    })
    const topologyLinks = computed(() => topologyState.links
      .filter((link) => topologyIncludeSimulated.value || !link.simulated)
      .filter((link) => {
        const visibleNodeIds = new Set(topologyNodes.value.map((node) => node.id))
        return visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target)
      })
      .map((link) => {
      const source = topologyNodes.value.find((node) => node.id === link.source)
      const target = topologyNodes.value.find((node) => node.id === link.target)
      const taskStream = link.link_type === 'task_stream'

      return {
        ...link,
        sourceId: link.source,
        targetId: link.target,
        source: source || { x: 130, y: 180 },
        target: target || { x: 500, y: 180 },
        width: taskStream
          ? 3
          : (link.simulated
          ? 0.8
          : Math.min(2, 1 + Number(link.color_level || 0) * 0.14)),
        color: taskStream
          ? '#ff4fd8'
          : (link.color || TOPOLOGY_TRAFFIC_META[link.traffic_level]?.color || '#2196f3'),
        dash: link.simulated ? '7 6' : ''
      }
      }).sort((left, right) => {
      const rank = (link) => link.link_type === 'task_stream' ? 3 : (link.simulated ? 1 : 2)
      return rank(left) - rank(right)
    }))
    const topologyTaskLinks = computed(() => (
      topologyLinks.value.filter((link) => link.link_type === 'task_stream')
    ))

    const formatTopologyEndpoint = (nodeId) => (
      nodeId === 'Ground001' ? '地面中心' : (nodeId || '未知节点')
    )

    const formatObject = (value) => {
      if (!value) return '-'
      return Object.entries(value)
        .map(([key, val]) => `${key}: ${val}`)
        .join(' / ')
    }

    watch(
      () => [props.current?.id, props.current?.topologyView],
      ([id, requestedTopologyView]) => {
        if (id === 'tasks' && taskState.jobs.length === 0 && !taskState.loadingJobs) {
          loadJobs()
        }
        if (id === 'node') loadNodeDirectory()
        if (id === 'physical') {
          Promise.all([
            fetchManagementData(),
            fetchNodes(),
            fetchResourceService().catch(() => null),
            fetchNodeResources().catch(() => null)
          ]).catch((error) => {
            nodeDirectoryLocalError.value = error?.message || '读取物理节点列表失败'
          })
        }
        if (id === 'topology') {
          if (!constellationGroupState.groups.length && !constellationGroupState.loading) {
            fetchConstellationGroups().catch(() => {})
          }
          if (['map', 'dynamic', 'links'].includes(requestedTopologyView)) {
            topologyView.value = requestedTopologyView
          }
          if (topologyView.value === 'map' && topologyState.nodes.length === 0 && !topologyState.loading) {
            loadTopology()
          }
        }
        if (id === 'balance' && balanceView.value === 'load' && !loadState.loading) {
          refreshLoadModule()
        }
      },
      { immediate: true }
    )

    return {
      taskState,
      loadState,
      loadLevels,
      canonicalLoadLevelKeys,
      weightFields,
      thresholdDraft,
      allNodeDirectory,
      nodeDirectory,
      nodeDirectoryError,
      nodeDirectoryLoading,
      nodeLayerFilter,
      nodeConstellationFilter,
      nodeStatusFilter,
      nodeNameKeyword,
      applyNodeFilter,
      resetNodeFilter,
      constellationFilterOptions,
      nodeModelState,
      resourceState,
      resourceTargets,
      npuCollectorTargets,
      resourceOnlineTargetCount,
      resourceServiceStatusText,
      refreshResourceService,
      formatResourcePercent,
      formatNpuAvailability,
      loadDisplayNodes,
      formatTargetStatus,
      formatResourceAlarm,
      formatResourceUpdateTime,
      syncOverwrite,
      syncBindDemoWorkers,
      poolLayers,
      hasInvalidBackendIpv6Pools,
      poolDraft,
      bindingDraft,
      operationNotice,
      physicalNodeOptions,
      selectedPhysicalBinding,
      formatLayer,
      repairIpv6Pools,
      syncModelsNow,
      savePoolDraft,
      saveBindingDraft,
      removeBindingNow,
      leoNodeCount,
      meoNodeCount,
      heoNodeCount,
      topologyState,
      topologyNodes,
      topologyLinks,
      topologyTaskLinks,
      formatTopologyEndpoint,
      topologyTimeIndex,
      topologyOrbitLayer,
      topologyConstellationId,
      topologyIncludeSimulated,
      topologyView,
      selectTopologyView,
      topologyTrafficLevels: TOPOLOGY_TRAFFIC_META,
      lbState,
      balanceView,
      selectBalanceView,
      fallbackContent,
      manifest,
      scheduling,
      visibleTiles,
      closePanel,
      loadJobs,
      openJob,
      loadNodeDirectory,
      openNode,
      openLoadNode,
      loadTopology,
      loadBalance,
      refreshLoadModule,
      reloadThresholds,
      saveThresholdDraft,
      formatLoadUpdateTime,
      formatObject
    }
  }
}
</script>

<style scoped>
.operation-notice {
  position: fixed;
  top: 76px;
  left: 50%;
  z-index: 120;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  width: min(430px, calc(100vw - 32px));
  padding: 13px 14px;
  transform: translateX(-50%);
  color: #dffff5;
  background: rgba(4, 31, 30, .96);
  border: 1px solid rgba(56, 255, 183, .52);
  border-radius: 8px;
  box-shadow: 0 14px 38px rgba(0, 0, 0, .48), 0 0 20px rgba(56, 255, 183, .12);
  backdrop-filter: blur(12px);
}

.operation-notice.error {
  color: #ffe3e8;
  background: rgba(46, 13, 22, .97);
  border-color: rgba(255, 77, 109, .58);
}

.operation-notice strong,
.operation-notice span {
  display: block;
}

.operation-notice strong {
  margin-bottom: 4px;
  color: #7affd0;
  font-size: 13px;
}

.operation-notice.error strong {
  color: #ff9caf;
}

.operation-notice span {
  font-size: 12px;
  line-height: 1.6;
}

.operation-notice button {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  margin-left: 12px;
  color: inherit;
  background: transparent;
  border: 0;
  cursor: pointer;
  font-size: 20px;
  line-height: 1;
}

.function-panel {
  position: fixed;
  left: 334px;
  top: 50%;
  z-index: 30;
  width: 372px;
  max-height: min(734px, calc(100vh - 64px));
  overflow: hidden;
  transform: translateY(-50%);
  color: #f2ffff;
  background:
    linear-gradient(180deg, rgba(4, 24, 32, .94), rgba(2, 9, 18, .9)),
    radial-gradient(circle at 15% 0, rgba(56, 255, 183, .18), transparent 34%);
  border: 1px solid rgba(56, 255, 183, .36);
  border-radius: 8px;
  box-shadow: 0 22px 62px rgba(0, 0, 0, .46), 0 0 26px rgba(56, 255, 183, .12);
  backdrop-filter: blur(16px);
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
}

.function-panel::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  border-radius: inherit;
  background:
    linear-gradient(90deg, rgba(56, 255, 183, .08), transparent 18%),
    repeating-linear-gradient(0deg, rgba(255, 255, 255, .025) 0, rgba(255, 255, 255, .025) 1px, transparent 1px, transparent 7px);
}

.function-panel.wide {
  width: 740px;
}

.function-panel.constellation-wide {
  width: min(920px, calc(100vw - 370px));
}

.function-panel.balance-wide {
  width: min(1120px, calc(100vw - 370px));
}

.function-panel.topology-full {
  top: 20px;
  right: 20px;
  bottom: 20px;
  left: 126px;
  width: auto;
  max-height: none;
  transform: none;
  background:
    linear-gradient(180deg, rgba(3, 20, 29, .96), rgba(1, 8, 16, .94)),
    radial-gradient(circle at 70% 30%, rgba(82, 196, 255, .12), transparent 44%);
}

.function-panel.topology-full .content {
  box-sizing: border-box;
  height: calc(100vh - 118px);
  max-height: none;
  overflow: hidden;
}

.function-panel.topology-full .topology-module {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  gap: 12px;
  height: 100%;
}

.function-panel.topology-full .topology-map-view {
  display: grid;
  grid-template-columns: 286px minmax(0, 1fr);
  grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
  gap: 12px 16px;
  min-height: 0;
  flex: 1;
}

.function-panel.topology-full .topology-map-view > .summary-card {
  grid-column: 1;
  grid-row: 1;
}

.function-panel.topology-full .topology-map-view > .task-toolbar {
  grid-column: 1;
  grid-row: 2;
}

.function-panel.topology-full .topology-map-view > .topology-controls {
  grid-column: 1;
  grid-row: 3;
}

.function-panel.topology-full .topology-map-view > .error-box {
  grid-column: 1;
  grid-row: 4;
}

.function-panel.topology-full .topology-map-view > .topology-legends {
  grid-column: 1;
  grid-row: 5;
  align-content: flex-start;
  padding: 11px;
  background: rgba(2, 18, 28, .5);
  border: 1px solid rgba(82, 196, 255, .16);
  border-radius: 7px;
}

.function-panel.topology-full .topology-map-view > .topology-canvas {
  grid-column: 2;
  grid-row: 1 / 6;
  width: 100%;
  height: auto;
  min-height: 0;
}

.function-panel.topology-full .topology-map-view > .topology-link-types {
  grid-column: 2;
  grid-row: 6;
  justify-content: center;
  padding: 8px;
  background: rgba(2, 18, 28, .5);
  border: 1px solid rgba(82, 196, 255, .14);
  border-radius: 6px;
}

.topology-workspace-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  flex: 0 0 auto;
}

.topology-workspace-tabs button {
  display: grid;
  gap: 3px;
  min-width: 0;
  padding: 10px 13px;
  text-align: left;
  color: rgba(226, 255, 251, .72);
  background: rgba(2, 18, 28, .55);
  border: 1px solid rgba(82, 196, 255, .2);
  border-radius: 7px;
  cursor: pointer;
}

.topology-workspace-tabs button:hover,
.topology-workspace-tabs button.active {
  color: #efffff;
  background: rgba(56, 255, 183, .09);
  border-color: rgba(56, 255, 183, .5);
  box-shadow: inset 0 0 18px rgba(56, 255, 183, .05);
}

.topology-workspace-tabs strong,
.topology-workspace-tabs small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topology-workspace-tabs strong {
  font-size: 14px;
}

.topology-workspace-tabs small {
  color: rgba(186, 222, 227, .58);
  font-size: 11px;
}

.embedded-topology-manager {
  flex: 1;
  height: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-color: rgba(82, 196, 255, .52) rgba(1, 10, 17, .72);
  scrollbar-width: thin;
  border: 1px solid rgba(82, 196, 255, .12);
  border-radius: 8px;
  background: rgba(1, 8, 16, .42);
}

.embedded-topology-manager > :deep(*) {
  min-height: max-content;
}

.panel-header,
.content {
  position: relative;
  z-index: 1;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(89, 216, 255, .2);
}

.eyebrow {
  color: #38ffb7;
  font-size: 11px;
}

h2 {
  margin: 4px 0 0;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
}

.content {
  max-height: calc(min(734px, 100vh - 64px) - 78px);
  padding: 16px 18px 18px;
  overflow: auto;
}

.module {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.balance-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 5px;
  background: rgba(1, 12, 20, .72);
  border: 1px solid rgba(82, 196, 255, .2);
  border-radius: 8px;
}

.balance-tabs button {
  min-width: 0;
  padding: 10px 12px;
  color: rgba(226, 255, 251, .7);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  text-align: left;
}

.balance-tabs button:hover,
.balance-tabs button.active {
  color: #fff;
  background: linear-gradient(135deg, rgba(56, 255, 183, .13), rgba(82, 196, 255, .08));
  border-color: rgba(56, 255, 183, .42);
}

.balance-tabs strong,
.balance-tabs small {
  display: block;
}

.balance-tabs strong {
  font-size: 13px;
}

.balance-tabs small {
  margin-top: 4px;
  overflow: hidden;
  color: rgba(201, 255, 247, .54);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.summary-card,
.stat-card,
.info-list div,
.job-item,
.empty-box,
.error-box {
  background: rgba(2, 18, 28, .72);
  border: 1px solid rgba(82, 196, 255, .26);
  border-radius: 7px;
}

.summary-card {
  padding: 14px;
  background:
    linear-gradient(135deg, rgba(56, 255, 183, .13), rgba(82, 196, 255, .04)),
    rgba(2, 18, 28, .68);
}

.summary-card span,
.stat-card span,
.info-list span {
  display: block;
  color: rgba(201, 255, 247, .66);
  font-size: 12px;
}

.summary-card strong,
.stat-card strong,
.info-list strong {
  display: block;
  margin-top: 6px;
  color: #fff;
  font-size: 14px;
  word-break: break-all;
}

.summary-card p {
  margin: 8px 0 0;
  color: rgba(226, 255, 251, .68);
  font-size: 12px;
  line-height: 1.6;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.stat-card {
  min-height: 64px;
  padding: 10px;
}

.stat-card strong {
  color: #38ffb7;
  font-size: 18px;
}

.task-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.task-toolbar button,
.close-btn,
.file-drop {
  color: #dffff8;
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .44);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}

.task-toolbar button {
  height: 34px;
  padding: 0 12px;
}

.task-toolbar span {
  color: rgba(201, 255, 247, .62);
  font-size: 12px;
}

.load-level-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 7px 10px;
  color: rgba(201, 255, 247, .62);
  font-size: 10px;
}

.load-level-legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.load-level-legend i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.load-node-list {
  display: grid;
  gap: 6px;
}

.load-node-card {
  display: grid;
  grid-template-columns: 8px minmax(0, 1fr) minmax(92px, auto) minmax(92px, auto);
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 48px;
  padding: 8px 10px;
  color: #eaffff;
  text-align: left;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(33, 150, 243, .22);
  border-radius: 6px;
  cursor: pointer;
}

.load-node-card:hover {
  background: rgba(33, 150, 243, .08);
  border-color: rgba(33, 150, 243, .52);
}

.load-node-card > i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  box-shadow: 0 0 8px currentColor;
}

.load-node-card span,
.load-node-card strong,
.load-node-card small {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.load-node-card strong {
  font-size: 12px;
}

.load-node-card small {
  margin-top: 3px;
  color: rgba(201, 255, 247, .5);
  font-size: 9px;
}

.load-node-card > b {
  color: #eaffff;
  font-size: 10px;
  text-align: right;
}

.load-node-card > .resource-alarm-text.warning {
  color: #ffcb77;
}

.load-node-card > .resource-alarm-text.critical,
.load-node-card > .resource-alarm-text.offline {
  color: #ff8298;
}

.load-node-card > .resource-alarm-text.unknown {
  color: rgba(201, 255, 247, .5);
}

.threshold-section {
  padding: 11px;
  background: rgba(2, 18, 28, .64);
  border: 1px solid rgba(33, 150, 243, .22);
  border-radius: 7px;
}

.threshold-section .section-heading > div strong,
.threshold-section .section-heading > div small {
  display: block;
}

.threshold-section .section-heading > div strong {
  color: #52c4ff;
  font-size: 13px;
}

.threshold-section .section-heading button,
.threshold-save {
  width: auto;
  min-height: 30px;
  padding: 0 10px;
  color: #dffff8;
  background: rgba(33, 150, 243, .08);
  border: 1px solid rgba(33, 150, 243, .42);
  border-radius: 5px;
  cursor: pointer;
}

.threshold-levels,
.threshold-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 10px;
}

.threshold-levels label {
  display: grid;
  grid-template-columns: minmax(42px, 1fr) 45px auto 45px;
  align-items: center;
  gap: 4px;
  font-size: 10px;
}

.threshold-levels em {
  color: rgba(201, 255, 247, .5);
  font-style: normal;
}

.threshold-grid label > span {
  display: block;
  margin-bottom: 4px;
  color: rgba(201, 255, 247, .62);
  font-size: 10px;
}

.threshold-section input,
.threshold-section select {
  box-sizing: border-box;
  width: 100%;
  height: 27px;
  padding: 0 5px;
  color: #eaffff;
  background: rgba(1, 10, 17, .82);
  border: 1px solid rgba(82, 196, 255, .26);
  border-radius: 4px;
  font-size: 10px;
}

.threshold-subtitle {
  margin-top: 12px;
  padding-top: 9px;
  color: #52c4ff;
  border-top: 1px solid rgba(82, 196, 255, .12);
  font-size: 11px;
}

.threshold-save {
  width: 100%;
  margin-top: 11px;
  border-color: rgba(56, 255, 183, .4);
  background: rgba(56, 255, 183, .08);
}

.directory-filters {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 9px;
  padding: 11px;
  background: rgba(2, 18, 28, .64);
  border: 1px solid rgba(82, 196, 255, .22);
  border-radius: 7px;
}

.directory-filters label {
  min-width: 0;
}

.directory-filters label > span {
  display: block;
  margin-bottom: 6px;
  color: rgba(201, 255, 247, .66);
  font-size: 11px;
}

.directory-search {
  grid-column: 1 / -1;
}

.directory-filter-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.directory-filter-actions button {
  min-width: 78px;
  height: 34px;
  color: #032018;
  background: #38ffb7;
  border: 1px solid #38ffb7;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.directory-filter-actions button.secondary {
  color: rgba(223, 255, 248, .82);
  background: transparent;
  border-color: rgba(82, 196, 255, .34);
}

.directory-filters select,
.directory-filters input {
  width: 100%;
  height: 34px;
  padding: 0 9px;
  color: #eaffff;
  background: rgba(3, 24, 34, .92);
  border: 1px solid rgba(82, 196, 255, .3);
  border-radius: 5px;
  outline: none;
  font: inherit;
  font-size: 12px;
}

.directory-filters select:focus,
.directory-filters input:focus {
  border-color: rgba(56, 255, 183, .72);
  box-shadow: 0 0 0 2px rgba(56, 255, 183, .08);
}

.directory-filters input::placeholder {
  color: rgba(201, 255, 247, .38);
}

.task-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 12px;
  min-height: 420px;
}

.job-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.job-item {
  min-height: 62px;
  padding: 10px;
  color: #eaffff;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.job-item.active,
.job-item:hover {
  background: rgba(56, 255, 183, .1);
  border-color: rgba(56, 255, 183, .56);
}

.job-item span {
  display: block;
  overflow: hidden;
  color: #fff;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.job-item small {
  display: block;
  margin-top: 7px;
  color: rgba(201, 255, 247, .58);
  font-size: 11px;
}

.job-detail {
  min-width: 0;
}

.detail-head {
  margin-bottom: 10px;
}

.detail-head span {
  color: #38ffb7;
  font-size: 12px;
}

.detail-head strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #fff;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.info-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.info-list div {
  padding: 10px;
}

.legend-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.legend-grid span {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 30px;
  padding: 0 9px;
  color: rgba(226, 255, 251, .72);
  background: rgba(2, 18, 28, .58);
  border: 1px solid rgba(82, 196, 255, .18);
  border-radius: 6px;
  font-size: 12px;
}

.legend-grid i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  box-shadow: 0 0 12px currentColor;
}

.load-list,
.policy-list,
.directory-list {
  display: grid;
  gap: 8px;
}

.directory-item {
  width: 100%;
  min-height: 58px;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 11px;
  color: #eaffff;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--node-color) 12%, transparent), transparent 46%),
    rgba(2, 18, 28, .72);
  border: 1px solid rgba(82, 196, 255, .22);
  border-left-color: var(--node-color);
  border-radius: 7px;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition: .18s ease;
}

.directory-item:hover {
  transform: translateX(2px);
  border-color: color-mix(in srgb, var(--node-color) 66%, transparent);
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--node-color) 20%, transparent), transparent 52%),
    rgba(3, 25, 36, .86);
}

.directory-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--node-color);
  box-shadow: 0 0 10px var(--node-color);
}

.directory-main,
.directory-meta {
  min-width: 0;
}

.directory-main strong,
.directory-meta strong {
  display: block;
  overflow: hidden;
  color: #fff;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-main small,
.directory-meta small {
  display: block;
  margin-top: 5px;
  overflow: hidden;
  color: rgba(201, 255, 247, .58);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.directory-meta {
  max-width: 92px;
  text-align: right;
}

.directory-meta strong {
  color: var(--node-color);
}

.success-box {
  padding: 10px;
  color: #bfffe8;
  background: rgba(56, 255, 183, .08);
  border: 1px solid rgba(56, 255, 183, .3);
  border-radius: 7px;
  font-size: 12px;
}

.warning-box {
  padding: 10px;
  color: #ffe39a;
  background: rgba(255, 184, 77, .08);
  border: 1px solid rgba(255, 184, 77, .34);
  border-radius: 7px;
  font-size: 12px;
}

.warning-box strong {
  display: block;
  color: #ffeab8;
}

.warning-box p {
  margin: 6px 0 9px;
  line-height: 1.6;
}

.warning-box button {
  width: 100%;
  min-height: 30px;
  color: #fff1ca;
  background: rgba(255, 184, 77, .1);
  border: 1px solid rgba(255, 184, 77, .42);
  border-radius: 5px;
  cursor: pointer;
}

.management-actions,
.binding-form {
  display: grid;
  gap: 8px;
  padding: 11px;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(82, 196, 255, .22);
  border-radius: 7px;
}

.resource-service-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 7px 10px;
  padding: 11px;
  color: rgba(226, 255, 251, .72);
  background: rgba(255, 184, 77, .06);
  border: 1px solid rgba(255, 184, 77, .28);
  border-radius: 7px;
}

.resource-service-card.ready {
  background: rgba(56, 255, 183, .06);
  border-color: rgba(56, 255, 183, .28);
}

.resource-service-card span,
.resource-service-card strong,
.resource-service-card small {
  display: block;
}

.resource-service-card span {
  color: rgba(201, 255, 247, .55);
  font-size: 10px;
}

.resource-service-card strong {
  margin-top: 4px;
  color: #ffe39a;
  font-size: 13px;
}

.resource-service-card.ready strong {
  color: #78ffd0;
}

.resource-service-card > small {
  grid-column: 1;
  font-size: 10px;
}

.resource-service-card .resource-service-error {
  color: #ff9caf;
}

.resource-service-card > button {
  grid-column: 2;
  grid-row: 1 / 3;
  align-self: center;
  min-height: 32px;
  padding: 0 9px;
  color: #dffff5;
  background: rgba(82, 196, 255, .08);
  border: 1px solid rgba(82, 196, 255, .34);
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
}

.resource-targets {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.resource-targets.npu-targets > strong {
  flex: 0 0 100%;
  color: #b694ff;
  font-size: 10px;
}

.resource-targets span {
  padding: 4px 6px;
  color: #ffcc82;
  background: rgba(255, 184, 77, .07);
  border: 1px solid rgba(255, 184, 77, .2);
  border-radius: 4px;
}

.resource-targets span.online {
  color: #87ffda;
  background: rgba(56, 255, 183, .06);
  border-color: rgba(56, 255, 183, .2);
}

.resource-targets b,
.resource-targets small {
  display: block;
}

.resource-targets b {
  font-size: 10px;
  font-weight: 600;
}

.resource-targets small {
  margin-top: 3px;
  color: rgba(201, 255, 247, .5);
  font-size: 9px;
}

.resource-metric-catalog {
  grid-column: 1 / -1;
  padding: 7px;
  background: rgba(2, 12, 20, .54);
  border: 1px solid rgba(82, 196, 255, .16);
  border-radius: 5px;
}

.resource-metric-catalog summary {
  color: #aeefff;
  cursor: pointer;
  font-size: 10px;
}

.resource-metric-catalog > div {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 7px;
}

.resource-metric-catalog > div > strong {
  flex: 0 0 100%;
  margin: 0;
  color: rgba(201, 255, 247, .65);
  font-size: 9px;
}

.resource-metric-catalog > div > span {
  padding: 3px 5px;
  color: rgba(226, 255, 251, .7);
  background: rgba(82, 196, 255, .06);
  border: 1px solid rgba(82, 196, 255, .14);
  border-radius: 3px;
  font-size: 9px;
}

.resource-metric-catalog > p {
  margin: 7px 0 0;
  color: rgba(201, 255, 247, .52);
  font-size: 9px;
  line-height: 1.5;
}

.resource-overview-heading {
  margin-top: 2px;
}

.resource-node-list {
  display: grid;
  gap: 6px;
}

.resource-node-card {
  display: grid;
  grid-template-columns: minmax(92px, 1.4fr) repeat(3, minmax(48px, .65fr));
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 48px;
  padding: 8px;
  color: #eaffff;
  text-align: left;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(56, 255, 183, .2);
  border-radius: 6px;
  cursor: pointer;
}

.resource-node-card:hover {
  background: rgba(56, 255, 183, .07);
  border-color: rgba(56, 255, 183, .46);
}

.resource-node-card.warning {
  border-color: rgba(255, 184, 77, .35);
}

.resource-node-card.critical,
.resource-node-card.offline {
  border-color: rgba(255, 77, 109, .38);
}

.resource-node-card > span {
  min-width: 0;
}

.resource-node-card strong,
.resource-node-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-node-card strong {
  color: #eaffff;
  font-size: 11px;
}

.resource-node-card small {
  margin-top: 3px;
  color: rgba(201, 255, 247, .5);
  font-size: 9px;
}

.resource-node-card > span:not(:first-child) {
  text-align: right;
}

.resource-node-empty {
  line-height: 1.65;
}

.management-actions label {
  color: rgba(226, 255, 251, .74);
  font-size: 12px;
}

.management-actions input[type='checkbox'] {
  margin-right: 6px;
  accent-color: #38ffb7;
}

.management-actions button,
.pool-card button,
.binding-form button {
  min-height: 34px;
  color: #062018;
  background: #38ffb7;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.management-actions button:disabled,
.pool-card button:disabled,
.binding-form button:disabled {
  cursor: wait;
  opacity: .55;
}

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding-top: 3px;
}

.section-heading span {
  color: #fff;
  font-size: 14px;
  font-weight: 700;
}

.section-heading small {
  color: rgba(201, 255, 247, .5);
  font-size: 10px;
}

.pool-list,
.binding-list {
  display: grid;
  gap: 8px;
}

.pool-card {
  display: grid;
  grid-template-columns: 112px minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
  align-items: end;
  padding: 10px;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(82, 196, 255, .22);
  border-radius: 7px;
}

.pool-card > strong {
  align-self: center;
  color: #38ffb7;
  font-size: 12px;
}

.pool-card label span {
  display: block;
  margin-bottom: 5px;
  color: rgba(201, 255, 247, .58);
  font-size: 10px;
}

.pool-card button {
  grid-column: 2 / -1;
}

.pool-card input,
.binding-form input,
.binding-form select {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  color: #eaffff;
  background: rgba(3, 24, 34, .9);
  border: 1px solid rgba(82, 196, 255, .28);
  border-radius: 5px;
  outline: none;
  font: inherit;
  font-size: 11px;
}

.binding-form input[readonly] {
  color: rgba(226, 255, 251, .66);
  cursor: default;
  background: rgba(3, 18, 26, .72);
}

.binding-occupied {
  margin: 0;
  padding: 8px;
  color: #ffe39a;
  background: rgba(255, 184, 77, .07);
  border: 1px solid rgba(255, 184, 77, .28);
  border-radius: 5px;
  font-size: 11px;
  line-height: 1.55;
}

.binding-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.binding-main,
.danger-btn {
  padding: 9px 10px;
  color: #eaffff;
  background: rgba(2, 18, 28, .68);
  border: 1px solid rgba(82, 196, 255, .22);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.binding-main strong,
.binding-main small {
  display: block;
}

.binding-main strong {
  font-size: 12px;
}

.binding-main small {
  margin-top: 5px;
  color: rgba(201, 255, 247, .54);
  font-size: 10px;
}

.danger-btn {
  color: #ff9b9b;
  border-color: rgba(255, 96, 96, .3);
  text-align: center;
}

.load-item,
.policy-card {
  padding: 11px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--level-color, #52c4ff) 18%, transparent), transparent 42%),
    rgba(2, 18, 28, .72);
  border: 1px solid rgba(82, 196, 255, .24);
  border-left-color: var(--level-color, #52c4ff);
  border-radius: 7px;
}

.load-item {
  display: grid;
  grid-template-columns: 1fr .9fr .9fr;
  gap: 10px;
  align-items: center;
}

.load-item strong,
.policy-card strong {
  display: block;
  color: #fff;
  font-size: 13px;
}

.load-item span,
.policy-card span,
.policy-card small {
  display: block;
  margin-top: 4px;
  color: rgba(201, 255, 247, .62);
  font-size: 11px;
  word-break: break-all;
}

.topology-canvas {
  height: 360px;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 50%, rgba(82, 196, 255, .08), transparent 54%),
    rgba(2, 18, 28, .7);
  border: 1px solid rgba(82, 196, 255, .24);
  border-radius: 7px;
}

.topology-controls {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 10px;
  background: rgba(2, 18, 28, .62);
  border: 1px solid rgba(82, 196, 255, .2);
  border-radius: 7px;
}

.topology-controls label > span {
  display: block;
  margin-bottom: 5px;
  color: rgba(201, 255, 247, .62);
  font-size: 10px;
}

.topology-controls input[type='number'],
.topology-controls select {
  box-sizing: border-box;
  width: 100%;
  height: 29px;
  padding: 0 7px;
  color: #eaffff;
  background: rgba(1, 10, 17, .82);
  border: 1px solid rgba(82, 196, 255, .28);
  border-radius: 4px;
}

.topology-simulated {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 6px;
  color: rgba(201, 255, 247, .68);
  font-size: 11px;
}

.topology-simulated input {
  accent-color: #38ffb7;
}

.topology-legends,
.topology-link-types {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 10px;
  color: rgba(201, 255, 247, .58);
  font-size: 9px;
}

.topology-legends span,
.topology-link-types span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.topology-legends i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.topology-task-list {
  box-sizing: border-box;
  width: 100%;
  margin-top: 8px;
  padding: 9px;
  color: rgba(255, 230, 250, .82);
  background: rgba(255, 79, 216, .07);
  border: 1px solid rgba(255, 79, 216, .28);
  border-radius: 5px;
}

.topology-task-list > strong,
.topology-task-list > span {
  display: block;
}

.topology-task-list > strong {
  margin-bottom: 6px;
  color: #ff79e3;
  font-size: 11px;
}

.topology-task-list > span {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 18px minmax(0, 1fr);
  align-items: center;
  gap: 3px;
  width: 100%;
  padding: 4px 0;
  font-size: 10px;
}

.topology-task-list > span > span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.topology-task-list b {
  color: #fff;
  font-size: 13px;
}

.topology-task-list em {
  grid-column: 1 / -1;
  margin-top: 2px;
  color: rgba(255, 230, 250, .62);
  font-style: normal;
}

.topology-link-types i {
  width: 22px;
  height: 1px;
  background: rgba(82, 196, 255, .72);
}

.topology-link-types i.dashed {
  background: repeating-linear-gradient(90deg, rgba(82, 196, 255, .62) 0 5px, transparent 5px 8px);
}

.topology-canvas svg {
  width: 100%;
  height: 100%;
}

.topology-link {
  stroke-linecap: round;
  opacity: .72;
}

.topology-link.task-stream {
  opacity: 1;
  filter: drop-shadow(0 0 5px rgba(255, 79, 216, .88));
}

.topology-task-flow {
  pointer-events: none;
  stroke: #fff;
  stroke-width: 1.4;
  stroke-dasharray: 3 15;
  stroke-linecap: round;
  filter: drop-shadow(0 0 4px #fff);
  animation: topologyTaskFlow 3s linear infinite;
}

@keyframes topologyTaskFlow {
  from { stroke-dashoffset: 18; }
  to { stroke-dashoffset: 0; }
}

.topology-grid-line {
  stroke: rgba(82, 196, 255, .08);
  stroke-width: 1;
  stroke-dasharray: 3 5;
}

.link-label {
  fill: rgba(226, 255, 251, .72);
  font-size: 12px;
  text-anchor: middle;
}

.topology-node circle {
  stroke: rgba(255, 255, 255, .62);
  stroke-width: 1;
  filter: drop-shadow(0 0 7px rgba(82, 196, 255, .3));
}

.topology-node.offline {
  opacity: .48;
}

.topology-node text {
  fill: #061018;
  font-size: 8px;
  font-weight: 800;
  text-anchor: middle;
}

.topology-node .node-label {
  fill: rgba(226, 255, 251, .76);
  font-size: 8px;
  font-weight: 500;
}

.topology-node {
  cursor: pointer;
}

.tile-table {
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid rgba(82, 196, 255, .2);
  border-radius: 7px;
}

.tile-row {
  display: grid;
  grid-template-columns: 1fr .8fr .7fr;
  gap: 8px;
  padding: 8px 10px;
  color: rgba(226, 255, 251, .78);
  border-top: 1px solid rgba(82, 196, 255, .12);
  font-size: 12px;
}

.tile-row.head {
  color: #38ffb7;
  background: rgba(56, 255, 183, .08);
  border-top: 0;
}

.empty-box,
.error-box {
  padding: 14px;
  color: rgba(226, 255, 251, .68);
  font-size: 12px;
}

.error-box {
  color: #ffd86b;
  border-color: rgba(255, 216, 107, .3);
}

.file-drop {
  min-height: 74px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 10px;
  border-style: dashed;
}

.file-drop input {
  display: none;
}

.file-drop small {
  color: rgba(201, 255, 247, .56);
  font-size: 11px;
}

.close-btn {
  width: 44px;
  height: 28px;
  font-size: 13px;
}

.close-btn:hover,
.task-toolbar button:hover {
  color: #fff;
  border-color: rgba(56, 255, 183, .72);
}

@media (max-width: 1050px) {
  .function-panel.topology-full {
    right: 12px;
    bottom: 12px;
    left: 104px;
    top: 12px;
  }

  .function-panel.topology-full .topology-module {
    grid-template-columns: 224px minmax(0, 1fr);
    gap: 9px 11px;
  }

  .function-panel.topology-full .summary-card p {
    display: none;
  }

  .function-panel.topology-full .topology-controls {
    grid-template-columns: 1fr;
  }

  .function-panel.topology-full .topology-simulated {
    grid-column: 1;
  }
}
</style>
