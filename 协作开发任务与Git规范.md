# 卫星网络可视化项目前端协作开发说明

## 一、项目和分支

- GitHub 仓库：`https://github.com/zxlm20/sat-visual.git`
- 稳定主分支：`main`
- 星座分组任务分支：`feature/constellation-groups`
- 负载均衡任务分支：`feature/lb-algorithm-manager`

分工如下：


| 人员   | 任务                         | 只能使用的分支                 |
| -------- | ------------------------------ | -------------------------------- |
| 陈叙池 | 星座分组配置前端模块         | `feature/constellation-groups` |
| 石礼昂 | 新版负载均衡算法管理前端模块 | `feature/lb-algorithm-manager` |

`main` 是当前可正常运行的稳定版本，已经设置保护规则。任何人都不能直接在 `main` 上开发或强制推送。功能完成后必须通过 Pull Request 申请合并，由项目负责人审核。

## 二、首次获取项目

先安装 Git、Node.js 和 npm，然后接受 GitHub 仓库协作邀请。

### 陈叙池

```powershell
git clone https://github.com/zxlm20/sat-visual.git sat-visual-constellation
cd sat-visual-constellation
git switch feature/constellation-groups
npm install
git branch --show-current
```

最后一条命令必须显示：

```text
feature/constellation-groups
```

### 石礼昂

```powershell
git clone https://github.com/zxlm20/sat-visual.git sat-visual-lb
cd sat-visual-lb
git switch feature/lb-algorithm-manager
npm install
git branch --show-current
```

最后一条命令必须显示：

```text
feature/lb-algorithm-manager
```

每个人必须使用独立的本地文件夹，不能多人共同编辑同一个物理文件夹。

## 三、陈叙池：星座分组任务

依据项目负责人另外发送的《VersionA 星座分组配置前端接口文档》实现独立的星座分组管理模块。

需要完成：

1. 查询全部星座分组和未分配卫星。
2. 新建、修改和删除星座。
3. 编辑星座名称、颜色、描述和成员。
4. 将一颗卫星移动到指定星座。
5. 将卫星移出星座，放入未分配列表。
6. 支持一次保存全部星座配置。
7. 支持恢复默认星座，但执行前必须有二次确认。
8. 显示成员数量、包含的轨道层以及是否跨轨道层。
9. 后端返回 `400` 等错误时，在界面明显位置展示后端 `detail`，不能静默失败。
10. 对外提供当前选择的 `constellation_id`，供项目负责人后续接入二维、三维拓扑筛选。

建议新增文件：

```text
src/api/constellationGroupApi.js
src/store/constellationGroupStore.js
src/components/constellation/ConstellationGroupManager.vue
```

本任务暂时不接入现有 `FunctionPanel.vue` 主界面，但必须提供一个可直接访问的独立测试页面，例如：

```text
src/views/dev/ConstellationGroupDemo.vue
访问地址：/dev/constellation-groups
```

测试页面必须挂载真实的 `ConstellationGroupManager` 组件并调用真实后端接口，确保查询、编辑、移动、删除、错误提示等功能可以在浏览器中完整操作和验收。

## 四、石礼昂：负载均衡算法任务

依据项目负责人另外发送的《前端负载均衡算法对接指南》实现独立的新版负载均衡算法管理模块。

需要完成：

1. 查询后端返回的全部算法，不能把算法列表硬编码为唯一数据来源。
2. `runtime_available=false` 的算法必须禁用应用操作并说明原因。
3. 根据后端 `parameters` 定义动态生成参数表单。
4. 正确处理 `string`、`integer`、`number`、`boolean` 和 `enum`。
5. 正确回填已保存参数和默认参数。
6. 使用字符串 `algorithm_id` 切换算法，不使用旧数字 `policy_id` 开发新功能。
7. 明确提示“已保存，从下一任务开始生效”，不能把切换成功显示成算法执行成功。
8. 分开展示 `desired`（下一任务期望配置）和 `runtime`（最近一次真实执行状态）。
9. 展示 `idle`、`running`、`succeeded`、`fallback_succeeded`、`failed` 状态。
10. 回退时显示请求算法、实际算法和回退原因。
11. 按 `config_revision` 判断运行状态是否属于本次配置，不能把旧任务结果当成新算法结果。
12. 展示最近一次有效调度结果，包括各节点任务数量和 assignment 明细。
13. 组件销毁时终止轮询；正常取消产生的 `AbortError` 不得弹成运行时错误。
14. 清晰处理 `400`、`404`、`409`、`422`、`5xx`、网络超时等错误。

建议新增文件：

```text
src/api/loadBalancingAlgorithmApi.js
src/store/loadBalancingAlgorithmStore.js
src/components/loadBalance/AlgorithmManager.vue
```

本任务暂时不接入现有 `FunctionPanel.vue` 主界面，但必须提供一个可直接访问的独立测试页面，例如：

```text
src/views/dev/LoadBalancingDemo.vue
访问地址：/dev/load-balancing
```

测试页面必须挂载真实的 `AlgorithmManager` 组件并调用真实后端接口，确保算法查询、动态参数、切换、状态轮询、回退信息和最近结果可以在浏览器中完整操作和验收。

## 五、独立测试页面要求

“独立模块”不等于只编写代码而不运行，也不允许只用静态图片证明完成。两位同学都需要：

1. 在自己的功能分支中新增独立 Demo 页面。
2. 可以对 `src/router/index.js` 做最小限度修改，为自己的 Demo 页面增加临时路由。
3. 不需要修改 `FunctionPanel.vue`、`CesiumEarth.vue` 或现有导航栏。
4. 使用 `npm run serve` 启动项目，并通过上述地址直接打开测试页面。
5. 页面必须连接真实后端接口；Mock 数据只能用于后端暂时不可用时检查布局，不能作为最终验收结果。
6. 展示加载中、成功、空数据、校验错误、网络错误等状态。
7. 提交功能截图或录屏，并在 Pull Request 中写明测试地址和操作步骤。
8. 项目负责人合并时会复用独立组件，并决定是否保留临时 Demo 路由。

## 六、共同技术要求

1. 项目使用 Vue 3、JavaScript 和现有原生 `fetch` 请求方式。
2. 不要擅自把代码改成 TypeScript。
3. 不要擅自引入 Axios、UI框架或其他依赖。
4. 项目环境变量名称是 `VUE_APP_API_BASE_URL`，不是 `VITE_API_BASE_URL`。
5. 使用项目现有接口根地址配置，不要把文档中的 `192.168.5.11:30080` 硬编码进代码。
6. 不允许在代码中提交密码、Token、密钥、私钥或个人账号信息。
7. 不提交 `.env`、`node_modules`、`dist`、日志或编辑器临时文件。
8. 页面文案使用中文，并与现有深色科技风界面保持一致。
9. 请求过程中需要有加载状态；成功、失败和空数据都必须有明确反馈。
10. 对可能删除、重置或覆盖后端数据的操作，必须进行二次确认。

## 七、禁止修改的公共核心文件

未经项目负责人明确同意，不要修改：

```text
src/views/satelliteTask/CesiumEarth.vue
src/components/layout/FunctionPanel.vue
src/components/layout/NodeDetailPanel.vue
src/hooks/useCesium.js
src/hooks/useSatellite.js
src/hooks/useTopology.js
src/store/topologyStore.js
src/api/backend.js
package.json
package-lock.json
vue.config.js
.env
```

原因是这些文件包含已经稳定运行的 Cesium、星历、拓扑、节点详情和公共请求逻辑，多个开发者同时修改会增加冲突和回归风险。确实需要修改时，先说明原因、拟修改位置和接口，再等待负责人确认。

严禁执行：

```text
git push --force
git push -f
git reset --hard
git checkout -- .
直接推送 main
删除或覆盖他人代码
```

## 八、接口联调纪律

1. 查询类 GET 接口可以正常测试。
2. POST、PUT、DELETE、恢复默认、切换算法等会改变后端共享状态，测试前必须通知项目负责人。
3. 不要重复点击或用脚本高频调用写接口。
4. 不要随意删除已有星座、重置全局配置或频繁切换共享算法。
5. 如果接口返回异常，记录请求方法、URL、请求体、HTTP状态码和响应体。
6. 不要为了“让页面能显示”而伪造成功结果或吞掉后端错误。

## 九、日常Git操作

每天开始工作时：

```powershell
git branch --show-current
git status
git pull origin 当前自己的分支名
```

提交前先检查：

```powershell
git status
git diff
```

只添加本任务文件，不要习惯性使用 `git add .`：

```powershell
git add src/api/自己的接口文件.js
git add src/store/自己的Store文件.js
git add src/components/自己的组件目录
```

提交并推送：

```powershell
git commit -m "feat: 简要说明本次完成的功能"
git push
```

建议把功能拆成小提交，例如：

```text
feat: add constellation group api
feat: add constellation group editor
fix: show duplicate member error
feat: add algorithm dynamic parameter form
feat: add load balancing runtime status
```

## 十、遇到冲突或保存警告时

如果 VS Code 提示：

- 文件在磁盘上较新
- 保存失败
- 比较或覆盖
- Git merge conflict

不要直接点击“覆盖”，也不要自行执行强制恢复命令。立即停止修改，保留现场并把以下内容发给项目负责人：

```powershell
git branch --show-current
git status
git diff
```

同时发送提示界面截图。由负责人决定保留哪一版代码。

## 十一、完成后的自测和交付

提交 Pull Request 前必须执行：

```powershell
npm run lint
npm run build
git status
```

Pull Request 必须满足：

- Base 分支：`main`
- Compare 分支：自己负责的功能分支
- 不允许自己直接合并

Pull Request 描述必须包含：

1. 完成了哪些功能。
2. 修改和新增了哪些文件。
3. 调用了哪些接口。
4. 成功、空数据和错误场景如何处理。
5. `npm run lint` 和 `npm run build` 的结果。
6. 功能截图或短录屏。
7. 尚未完成的问题和已知限制。

最终需要交付：

- GitHub Pull Request 链接。
- 接口联调记录。
- 功能截图或录屏。
- 验收清单。
- 未完成事项说明。

项目负责人审核通过后再合并到 `main`。任何“界面能打开但错误被隐藏”“使用写死模拟数据代替接口”“破坏原有功能”的提交均不算完成。
