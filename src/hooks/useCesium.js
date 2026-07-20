import * as Cesium from 'cesium'
import { ref, onMounted, onUnmounted } from 'vue'

import { applyEarthStyle } from '@/cesium/earth/EarthStyle'
import { applyAtmosphere } from '@/cesium/effect/Atmosphere'
import { setupCamera } from '@/cesium/camera/CameraController'

export function useCesium(containerRef) {
  const viewer = ref(null)
  const loading = ref(true)
  const tickListeners = []

  const initEarth = async () => {
    try {
      const viewerInstance = new Cesium.Viewer(containerRef.value, {
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        animation: false,
        timeline: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        navigationHelpButton: false,
        baseLayerPicker: false,
        shouldAnimate: true,
        requestRenderMode: false,
        backgroundColor: new Cesium.Color(0.001, 0.003, 0.009, 1),
        skyBox: new Cesium.SkyBox({
          sources: {
            positiveX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_px.jpg'),
            negativeX: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mx.jpg'),
            positiveY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_py.jpg'),
            negativeY: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_my.jpg'),
            positiveZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_pz.jpg'),
            negativeZ: Cesium.buildModuleUrl('Assets/Textures/SkyBox/tycho2t3_80_mz.jpg')
          }
        })
      })

      const credit = viewerInstance.cesiumWidget.creditContainer
      if (credit) credit.style.display = 'none'

      viewer.value = viewerInstance

      await applyEarthStyle(viewerInstance)
      try {
        applyAtmosphere(viewerInstance)
      } catch (error) {
        // 大气与镜头光晕属于非关键视觉效果，失败时不应中断相机和卫星场景初始化。
        console.warn('Cesium atmosphere effect skipped:', error)
      }
      setupCamera(viewerInstance)

      loading.value = false
      console.log('Cesium scene ready')
    } catch (err) {
      console.error(err)
      loading.value = false
    }
  }

  const resetCamera = () => {
    if (!viewer.value) return
    viewer.value.camera.cancelFlight()
    setupCamera(viewer.value)
  }

  const registerTickListener = (fn) => {
    tickListeners.push(fn)
  }

  onMounted(() => {
    initEarth()
  })

  onUnmounted(() => {
    tickListeners.forEach((fn) => fn && fn())

    if (viewer.value) {
      viewer.value.destroy()
      viewer.value = null
    }
  })

  return {
    viewer,
    loading,
    resetCamera,
    registerTickListener
  }
}
