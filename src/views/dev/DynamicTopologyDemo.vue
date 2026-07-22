<!--
  DynamicTopologyDemo — 动态拓扑独立验收页面
-->

<template>
  <div class="demo-container">
    <DynamicTopologyManager ref="managerRef" />
  </div>
</template>

<script>
import { ref } from 'vue'
import DynamicTopologyManager from '@/components/topology/DynamicTopologyManager.vue'

export default {
  name: 'DynamicTopologyDemo',

  components: {
    DynamicTopologyManager
  },

  setup() {
    const managerRef = ref(null)

    return {
      managerRef
    }
  }
}
</script>

<style scoped>
.demo-container {
  min-height: 100vh;
  background: #010309;
}
</style>

<!--
  覆盖 App.vue 中 #app 的 overflow: hidden，允许 Demo 页面滚动。
  非 scoped 确保能命中父级 #app 元素。
-->
<style>
body {
  overflow: auto !important;
}
#app {
  overflow-y: auto !important;
}
</style>
