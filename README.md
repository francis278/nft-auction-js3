# 🎯 NFT Auction Market

[![Solidity](https://img.shields.io/badge/Solidity-0.8.20-blue.svg)](https://soliditylang.org/)
[![Hardhat](https://img.shields.io/badge/Hardhat-Testing-orange.svg)](https://hardhat.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-Contracts-green.svg)](https://openzeppelin.com/)

## 📖 项目概述

一个基于以太坊的完整NFT拍卖市场，支持多币种竞价和实时价格预言机。

### ✨ 核心特性

- 🏷️ **多币种支持** - ETH 和 ERC20 代币出价
- 🔄 **可升级架构** - UUPS 代理模式，支持合约升级
- 📊 **价格预言机** - Chainlink 集成，实时价格换算
- 🛡️ **安全机制** - 管理员权限控制，资金安全保护
- 🧪 **完整测试** - 100% 测试覆盖率，确保合约安全

## 🏗 项目结构

```bash
nft-auction/
├── contracts/                 # 智能合约
│   ├── NftAuction.sol        # 🎯 主拍卖合约
│   ├── NftAuctionV2.sol      # 🔄 可升级版本
│   ├── MockNFT.sol           # 🖼️ 测试用NFT合约
│   ├── MockPriceFeed.sol     # 📊 模拟价格预言机
│   └── MockERC20.sol         # 💰 测试用ERC20代币
├── test/                     # 测试套件
│   ├── NftAuction.test.js    # ✅ 主合约测试
│   ├── MockNFT.test.js       # ✅ NFT合约测试
│   ├── MockPriceFeed.test.js # ✅ 预言机测试
│   └── NftAuctionV2.test.js  # ✅ 升级合约测试
├── scripts/                  # 部署脚本
│   └── deploy.js             # 🚀 合约部署脚本
├── hardhat.config.js         # ⚙️ Hardhat配置
└── package.json              # 📦 项目依赖
```

## 🚀 快速开始

### 环境要求

- Node.js 16+ 
- npm 或 yarn
- Git

### 安装步骤

1. **克隆项目**
```bash
git clone <your-repo-url>
cd nft-auction
```

2. **安装依赖**
```bash
npm install
```

3. **编译合约**
```bash
npx hardhat compile
```

4. **运行测试**
```bash
# 运行所有测试
npx hardhat test

# 运行特定测试文件
npx hardhat test test/NftAuction.test.js

# 生成测试覆盖率报告
npx hardhat coverage
```

## 📋 核心功能

### 拍卖管理

| 功能     | 描述                    | 权限   |
| -------- | ----------------------- | ------ |
| 创建拍卖 | 管理员创建新的NFT拍卖   | 管理员 |
| 出价竞拍 | 用户使用ETH或ERC20出价  | 任何人 |
| 结束拍卖 | 拍卖结束后分配NFT和资金 | 管理员 |

### 代币支持

- **ETH**: 原生以太币支付
- **ERC20**: 任何标准ERC20代币支付
- **价格换算**: 通过Chainlink预言机进行币种换算

### 安全特性

- 管理员权限控制
- 可升级合约架构
- 资金安全退还机制
- 完整的输入验证

## 🔧 部署指南

### 本地开发网络

1. **启动本地节点**
```bash
npx hardhat node
```

2. **部署合约**
```bash
npx hardhat run scripts/deploy.js --network localhost
```

### 测试网部署

1. **配置环境变量**
```bash
# 在 .env 文件中设置
PRIVATE_KEY=你的私钥
INFURA_API_KEY=你的Infura密钥
```

2. **部署到Goerli测试网**
```bash
npx hardhat run scripts/deploy.js --network goerli
```

### 主网部署

```bash
npx hardhat run scripts/deploy.js --network mainnet
```

## 📊 合约地址

| 网络   | NftAuction地址 | MockNFT地址 |
| ------ | -------------- | ----------- |
| 本地   | `0x...`        | `0x...`     |
| Goerli | `0x...`        | `0x...`     |
| 主网   | `0x...`        | `0x...`     |

## 🧪 测试覆盖

```bash
# 当前测试覆盖率
npx hardhat coverage

# 结果示例
All files           |   100%   |  88.24%  |   100%   |   100%   |
```

## 🤝 开发贡献

### 代码规范

- 使用 Solidity 0.8.20
- 遵循 OpenZeppelin 标准
- 编写完整的测试用例

### 开发流程

1. Fork 项目
2. 创建功能分支
3. 提交代码变更
4. 编写测试用例
5. 提交 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 📞 联系我们

- 项目主页: [GitHub Repository]()
- 问题反馈: [Issues]()
- 邮箱: your-email@example.com

---

**Happy Building! 🚀**