import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const bannerText = `/*!
 * ${pkg.name} v${pkg.version}
 * ${pkg.description}
 * 
 * 构建时间: ${new Date().toISOString()}
 * 
 * 使用方法:
 * 1. 将此文件复制到Jellyfin Web目录
 * 2. 在index.html的</body>前添加: <script src="./jellyfin-danmaku.js"></script>
 * 3. 或者将内容直接注入到<script>标签中
 * 
 * @license ${pkg.license}
 */`;

export default [
  // 开发版本 (未压缩)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/jellyfin-danmaku.js',
      format: 'iife',
      name: 'JellyfinDanmaku',
      sourcemap: true,
      banner: bannerText
    },
    plugins: [
      resolve({
        browser: true
      }),
      commonjs()
    ]
  },
  // 生产版本 (压缩)
  {
    input: 'src/index.js',
    output: {
      file: 'dist/jellyfin-danmaku.min.js',
      format: 'iife',
      name: 'JellyfinDanmaku',
      sourcemap: true,
      banner: bannerText
    },
    plugins: [
      resolve({
        browser: true
      }),
      commonjs(),
      terser({
        compress: {
          drop_console: false, // 保留console.log用于调试
          drop_debugger: true
        },
        format: {
          comments: /^!/
        }
      })
    ]
  }
];
