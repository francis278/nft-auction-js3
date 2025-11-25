const { ethers, upgrades } = require("hardhat");

async function main() {
  console.log("🚀 开始部署 NFT Auction Market...");

  // 获取部署者账户
  const [deployer] = await ethers.getSigners();
  console.log("📝 部署者地址:", deployer.address);
  console.log("💰 部署者余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // 1. 部署 MockNFT 合约
  console.log("\n📦 部署 MockNFT 合约...");
  const MockNFT = await ethers.getContractFactory("MockNFT");
  const mockNFT = await MockNFT.deploy();
  await mockNFT.waitForDeployment();
  const mockNFTAddress = await mockNFT.getAddress();
  console.log("✅ MockNFT 部署完成:", mockNFTAddress);

  // 2. 部署 MockPriceFeed 合约
  console.log("\n📊 部署 MockPriceFeed 合约...");
  const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
  const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8); // 1 ETH = 2000 USD
  await mockPriceFeed.waitForDeployment();
  const mockPriceFeedAddress = await mockPriceFeed.getAddress();
  console.log("✅ MockPriceFeed 部署完成:", mockPriceFeedAddress);

  // 3. 部署 MockERC20 合约
  console.log("\n💰 部署 MockERC20 合约...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockERC20 = await MockERC20.deploy("Test USDT", "USDT", ethers.parseEther("1000000"));
  await mockERC20.waitForDeployment();
  const mockERC20Address = await mockERC20.getAddress();
  console.log("✅ MockERC20 部署完成:", mockERC20Address);

  // 4. 部署 NftAuction 主合约（可升级）
  console.log("\n🎯 部署 NftAuction 主合约...");
  const NftAuction = await ethers.getContractFactory("NftAuction");
  const nftAuction = await upgrades.deployProxy(NftAuction, [], {
    initializer: "initialize"
  });
  await nftAuction.waitForDeployment();
  const nftAuctionAddress = await nftAuction.getAddress();
  console.log("✅ NftAuction 部署完成:", nftAuctionAddress);

  // 5. 设置价格预言机
  console.log("\n⚙️ 配置价格预言机...");
  await nftAuction.setPriceFeed(ethers.ZeroAddress, mockPriceFeedAddress); // ETH/USD
  await nftAuction.setPriceFeed(mockERC20Address, mockPriceFeedAddress);   // ERC20/USD
  console.log("✅ 价格预言机配置完成");

  // 6. 铸造测试NFT
  console.log("\n🖼️ 铸造测试NFT...");
  await mockNFT.mint(deployer.address, 1);
  await mockNFT.mint(deployer.address, 2);
  console.log("✅ 测试NFT铸造完成");

  console.log("\n🎉 所有合约部署完成！");
  console.log("==========================================");
  console.log("📋 合约地址汇总:");
  console.log("------------------------------------------");
  console.log("🎯 NftAuction:", nftAuctionAddress);
  console.log("🖼️ MockNFT:", mockNFTAddress);
  console.log("📊 MockPriceFeed:", mockPriceFeedAddress);
  console.log("💰 MockERC20:", mockERC20Address);
  console.log("==========================================");

  return {
    nftAuction: nftAuctionAddress,
    mockNFT: mockNFTAddress,
    mockPriceFeed: mockPriceFeedAddress,
    mockERC20: mockERC20Address
  };
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ 部署失败:", error);
    process.exit(1);
  });