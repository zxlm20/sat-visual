import { computed, reactive } from 'vue'
import { getCurrentLoadBalance, getLoadBalancePolicies } from '@/api/backend'

const state = reactive({
  policies: [],
  current: null,
  loading: false,
  error: '',
  updateTime: null
})

async function fetchLoadBalance() {
  state.loading = true
  state.error = ''

  try {
    const [policiesData, currentData] = await Promise.all([
      getLoadBalancePolicies(),
      getCurrentLoadBalance()
    ])

    state.policies = policiesData?.policies || []
    state.current = currentData || null
    state.updateTime = Date.now()
    return state
  } catch (err) {
    state.error = err?.message || '获取负载均衡策略失败'
    throw err
  } finally {
    state.loading = false
  }
}

export function useLoadBalanceStore() {
  return {
    state,
    policies: computed(() => state.policies),
    current: computed(() => state.current),
    loading: computed(() => state.loading),
    error: computed(() => state.error),
    fetchLoadBalance
  }
}
