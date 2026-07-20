import { computed, reactive } from 'vue'
import { getJobDetail, getJobs, getJobTiles } from '@/api/backend'

const state = reactive({
  jobs: [],
  selectedJobId: '',
  jobDetail: null,
  tiles: [],
  loadingJobs: false,
  loadingDetail: false,
  error: '',
  updateTime: null
})

async function fetchJobs(limit = 20) {
  state.loadingJobs = true
  state.error = ''

  try {
    const data = await getJobs(limit)
    state.jobs = data?.jobs || []
    state.updateTime = Date.now()
    return state.jobs
  } catch (err) {
    state.error = err?.message || '获取历史任务失败'
    throw err
  } finally {
    state.loadingJobs = false
  }
}

async function selectJob(jobId) {
  state.selectedJobId = jobId
  state.loadingDetail = true
  state.error = ''

  try {
    const [detail, tileData] = await Promise.all([
      getJobDetail(jobId),
      getJobTiles(jobId)
    ])

    state.jobDetail = detail
    state.tiles = tileData?.tiles || []
    return {
      detail,
      tiles: state.tiles
    }
  } catch (err) {
    state.error = err?.message || '获取任务详情失败'
    throw err
  } finally {
    state.loadingDetail = false
  }
}

export function useTaskStore() {
  return {
    state,
    jobs: computed(() => state.jobs),
    selectedJobId: computed(() => state.selectedJobId),
    jobDetail: computed(() => state.jobDetail),
    tiles: computed(() => state.tiles),
    loadingJobs: computed(() => state.loadingJobs),
    loadingDetail: computed(() => state.loadingDetail),
    error: computed(() => state.error),
    fetchJobs,
    selectJob
  }
}
