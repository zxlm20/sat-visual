import * as Cesium from 'cesium'

const CAMERA_DESTINATION = Cesium.Cartesian3.fromDegrees(104, 28, 32000000)
const CAMERA_ORIENTATION = {
  heading: Cesium.Math.toRadians(0),
  pitch: Cesium.Math.toRadians(-90),
  roll: 0
}

export function setupCamera(viewer, fly = false) {
  const controller = viewer.scene.screenSpaceCameraController

  controller.enableTranslate = false
  controller.enableZoom = true
  controller.enableRotate = true
  controller.enableTilt = true
  controller.enableLook = false
  controller.minimumZoomDistance = 7600000
  controller.maximumZoomDistance = Number.POSITIVE_INFINITY
  controller.zoomEventTypes = [
    Cesium.CameraEventType.WHEEL,
    Cesium.CameraEventType.PINCH
  ]
  controller.rotateEventTypes = [
    Cesium.CameraEventType.LEFT_DRAG,
    Cesium.CameraEventType.PINCH
  ]

  const cameraOptions = {
    destination: CAMERA_DESTINATION,
    orientation: CAMERA_ORIENTATION
  }

  if (fly) {
    viewer.camera.flyTo({
      ...cameraOptions,
      duration: 1.2
    })
    return
  }

  viewer.camera.setView(cameraOptions)
}
