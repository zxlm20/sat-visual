import * as Cesium from 'cesium'

const REALISTIC_GRADE_STAGE = 'realistic-earth-grade'
let lensFlareStage = null

function applyRealisticColorGrade(scene) {
  if (scene.postProcessStages.getStageByName?.(REALISTIC_GRADE_STAGE)) return

  scene.postProcessStages.add(new Cesium.PostProcessStage({
    name: REALISTIC_GRADE_STAGE,
    fragmentShader: `
      uniform sampler2D colorTexture;
      in vec2 v_textureCoordinates;

      float luma(vec3 color) {
        return dot(color, vec3(0.2126, 0.7152, 0.0722));
      }

      void main(void) {
        vec4 color = texture(colorTexture, v_textureCoordinates);
        vec3 graded = color.rgb;

        float lum = luma(graded);
        graded = mix(vec3(lum), graded, 0.9);
        graded = (graded - 0.5) * 1.22 + 0.5;
        graded *= vec3(0.88, 0.94, 1.0);

        float cyanMask = smoothstep(0.18, 0.56, graded.b - graded.r);
        graded = mix(graded, vec3(graded.r * 0.76, graded.g * 0.82, graded.b * 0.68), cyanMask * 0.58);

        float greenMask = smoothstep(0.04, 0.24, graded.g - max(graded.r, graded.b));
        graded = mix(graded, vec3(graded.r * 0.88, graded.g * 0.84, graded.b * 0.82), greenMask * 0.22);

        vec2 centered = v_textureCoordinates - vec2(0.5);
        float vignette = smoothstep(0.78, 0.18, dot(centered, centered));
        graded *= mix(0.58, 1.0, vignette);

        out_FragColor = vec4(max(graded, vec3(0.0)), color.a);
      }
    `
  }))
}

export function applyAtmosphere(viewer) {
  const { scene } = viewer

  scene.skyAtmosphere.show = true
  scene.skyAtmosphere.atmosphereLightIntensity = 9.4
  scene.skyAtmosphere.brightnessShift = 0
  scene.skyAtmosphere.saturationShift = 0
  scene.skyAtmosphere.hueShift = -0.02

  scene.fog.enabled = true
  scene.fog.density = 0.000004
  scene.fog.minimumBrightness = 0.05
  scene.backgroundColor = new Cesium.Color(0.001, 0.003, 0.009, 1)

  const bloom = scene.postProcessStages.bloom

  if (bloom) {
    bloom.enabled = true
    bloom.uniforms.glowOnly = false
    bloom.uniforms.contrast = 142
    bloom.uniforms.brightness = -0.34
    bloom.uniforms.delta = 0.72
    bloom.uniforms.sigma = 2.2
    bloom.uniforms.stepSize = 0.74
  }

  if (!lensFlareStage || lensFlareStage.isDestroyed?.()) {
    lensFlareStage = Cesium.PostProcessStageLibrary.createLensFlareStage()
    lensFlareStage.uniforms.intensity = 0.75
    lensFlareStage.uniforms.distortion = 6
    lensFlareStage.uniforms.ghostDispersal = 0.28
    lensFlareStage.uniforms.haloWidth = 0.14
    lensFlareStage.uniforms.dirtAmount = 0.08
    scene.postProcessStages.add(lensFlareStage)
  }

  if (process.env.VUE_APP_ENABLE_EARTH_COLOR_GRADE === 'true') {
    applyRealisticColorGrade(scene)
  }
}
