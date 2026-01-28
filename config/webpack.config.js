const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

const isDev = process.env.NODE_ENV !== 'production';

module.exports = {
  mode: isDev ? 'development' : 'production',

  // 渲染进程入口
  entry: {
    renderer: path.resolve(__dirname, '../src/renderer/renderer.js')
  },

  output: {
    path: path.resolve(__dirname, '../dist'),
    filename: '[name].[contenthash].js',
    clean: true
  },

  // Electron 渲染进程目标
  target: 'web',

  module: {
    rules: [
      // JavaScript
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env']
          }
        }
      },
      // CSS
      {
        test: /\.css$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      },
      // 图片资源
      {
        test: /\.(png|svg|jpg|jpeg|gif|ico)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'images/[name].[hash][ext]'
        }
      },
      // 字体资源
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'fonts/[name].[hash][ext]'
        }
      }
    ]
  },

  plugins: [
    // 生成 HTML 文件
    new HtmlWebpackPlugin({
      template: path.resolve(__dirname, '../src/renderer/index.html'),
      filename: 'index.html',
      inject: 'body',
      minify: !isDev ? {
        removeComments: true,
        collapseWhitespace: true,
        removeAttributeQuotes: true
      } : false
    }),

    // 提取 CSS 到单独文件（生产环境）
    ...(!isDev ? [new MiniCssExtractPlugin({
      filename: 'css/[name].[contenthash].css'
    })] : []),

    // 复制主进程和 preload 文件到 dist
    new CopyPlugin({
      patterns: [
        { from: path.resolve(__dirname, '../src/main/main.js'), to: 'main.js' },
        { from: path.resolve(__dirname, '../src/main/preload.js'), to: 'preload.js' }
      ]
    })
  ],

  optimization: {
    minimize: !isDev,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: !isDev
          }
        }
      }),
      new CssMinimizerPlugin()
    ],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  },

  devtool: isDev ? 'source-map' : false,

  // 开发服务器配置（用于热重载）
  devServer: {
    static: {
      directory: path.join(__dirname, '../dist')
    },
    port: 9000,
    hot: true,
    open: false
  },

  resolve: {
    extensions: ['.js', '.json']
  },

  // 忽略 Node.js 内置模块（渲染进程通过 preload 访问）
  externals: {
    electron: 'commonjs electron'
  }
};
