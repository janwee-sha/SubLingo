# 正式包验证（2026-08-13）

- 产物：`build/package/SubLingo-0.1.0.iinaplgz`
- 版本：`0.1.0`
- 大小：336,849 字节
- SHA-256：`30058744fdce4dbceea61211cb250457bfdb55eb413ab0704f822186221232ac`

## 包内容

```text
dist/
dist/ui/
dist/ui/sidebar.162e7c73.js
dist/ui/sidebar.a9aa70e1.js
dist/ui/sidebar.html
dist/ui/sidebar.96d056b2.css
dist/native/
dist/native/sublingo-transport
dist/global.js
dist/main.js
README.md
Info.json
```

`scripts/pack.sh` 与 `scripts/verify-package.sh` 均通过。归档只包含运行材料，不包含源码、测试、规格、依赖树、构建缓存、运行时目录、凭据、环境文件或密钥材料。

## Native helper

- 大小：899,392 字节
- 权限：`-rwxr-xr-x`
- 架构：`x86_64`、`arm64`
- 签名：嵌入式 ad-hoc 签名，`codesign --verify --strict` 通过
- SHA-256：`24a39a24847c8bc865972201e8b63bd3db31c657f3ee11bf120b556ffb151f57`

## 构建文件哈希

- `dist/main.js`：`1675f0500314e6fb8508f6f677368c6d3e8bc3007380d3878cd7c10863aafe26`
- `dist/global.js`：`a11dc8fcda76a62acf4e969777b68c5d99c4c8061722f908475f5aae3df92c36`
