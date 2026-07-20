import * as Cesium from 'cesium'

function tuneImageryLayer(layer) {
  layer.brightness = 0.9
  layer.contrast = 1.16
  layer.hue = 0
  layer.saturation = 0.96
  layer.gamma = 1
}

async function addSingleTileFallback(viewer) {
  const westProvider = await Cesium.SingleTileImageryProvider.fromUrl(
    Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII/0/0/0.jpg'),
    {
      rectangle: Cesium.Rectangle.fromDegrees(-180, -90, 0, 90)
    }
  )

  const eastProvider = await Cesium.SingleTileImageryProvider.fromUrl(
    Cesium.buildModuleUrl('Assets/Textures/NaturalEarthII/0/1/0.jpg'),
    {
      rectangle: Cesium.Rectangle.fromDegrees(0, -90, 180, 90)
    }
  )

  ;[
    viewer.imageryLayers.addImageryProvider(westProvider),
    viewer.imageryLayers.addImageryProvider(eastProvider)
  ].forEach(tuneImageryLayer)
}

async function addConfiguredImagery(viewer, url) {
  const imageryProvider = new Cesium.UrlTemplateImageryProvider({
    url,
    minimumLevel: 0,
    maximumLevel: 8,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
    credit: ''
  })

  const layer = viewer.imageryLayers.addImageryProvider(imageryProvider)
  tuneImageryLayer(layer)
}

export async function applyEarthStyle(viewer) {
  const { scene } = viewer
  const globe = scene.globe
  const configuredImageryUrl = process.env.VUE_APP_EARTH_IMAGERY_URL

  globe.show = true
  viewer.imageryLayers.removeAll()

  try {
    if (configuredImageryUrl) await addConfiguredImagery(viewer, configuredImageryUrl)
    else await addSingleTileFallback(viewer)
  } catch (err) {
    console.warn('Earth imagery failed, using single tile fallback.', err)
    await addSingleTileFallback(viewer)
  }

  globe.show = true
  globe.enableLighting = true
  globe.lambertDiffuseMultiplier = 1.8
  globe.dynamicAtmosphereLighting = true
  globe.dynamicAtmosphereLightingFromSun = true
  globe.showGroundAtmosphere = true
  globe.depthTestAgainstTerrain = false
  globe.maximumScreenSpaceError = 1.5
  globe.tileCacheSize = 128
  globe.baseColor = new Cesium.Color(0.002, 0.005, 0.01, 1)
  globe.nightFadeOutDistance = 50000000
  globe.nightFadeInDistance = 12000000

  if ('atmosphereLightIntensity' in globe) {
    globe.atmosphereLightIntensity = 9.4
    globe.atmosphereBrightnessShift = 0.02
    globe.atmosphereSaturationShift = 0
    globe.atmosphereHueShift = -0.02
  }

  scene.light = new Cesium.SunLight({
    intensity: 1.35
  })
  scene.sun = new Cesium.Sun()
  scene.sun.show = true
  scene.sun.glowFactor = 2.6
  scene.moon.show = true
  scene.highDynamicRange = true
  scene.exposure = 1.08
  scene.farToNearRatio = 1e9
}
