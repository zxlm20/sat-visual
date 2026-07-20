const { defineConfig } = require('@vue/cli-service')
const webpack = require('webpack')
const path = require('path')
const CopyWebpackPlugin = require('copy-webpack-plugin')

module.exports = defineConfig({
  transpileDependencies: true,
  configureWebpack: {
    resolve: {
      fallback: {
        path: require.resolve('path-browserify'),
        fs: false,
        http: false,
        https: false,
        url: false,
        util: false,
        stream: false,
        crypto: false,
        os: false,
        net: false,
        tls: false,
        zlib: false,
        assert: false,
        buffer: false,
        process: false,
        querystring: false,
      },
    },
    plugins: [
      // 复制 Cesium 静态资源到 output 目录
      new CopyWebpackPlugin({
        patterns: [
          {
            from: path.join(__dirname, 'node_modules/cesium/Build/Cesium/Workers'),
            to: 'Workers',
          },
          {
            from: path.join(__dirname, 'node_modules/cesium/Build/Cesium/ThirdParty'),
            to: 'ThirdParty',
          },
          {
            from: path.join(__dirname, 'node_modules/cesium/Build/Cesium/Assets'),
            to: 'Assets',
          },
          {
            from: path.join(__dirname, 'node_modules/cesium/Build/Cesium/Widgets'),
            to: 'Widgets',
          },
        ],
      }),
      new webpack.DefinePlugin({
        CESIUM_BASE_URL: JSON.stringify('/'),
      }),
    ],
    module: {
      unknownContextCritical: false,
    },
  },
})