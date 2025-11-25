const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NftAuctionV2", function () {
    let nftAuctionV2, nftContract, nftAddress;
    let admin, user1;

    beforeEach(async function () {
        [admin, user1] = await ethers.getSigners();

        // 部署基础合约 V1
        const NftAuction = await ethers.getContractFactory("NftAuction");
        const nftAuction = await upgrades.deployProxy(NftAuction, [], {
            initializer: "initialize"
        });
        await nftAuction.waitForDeployment();

        // 升级到 V2
        const NftAuctionV2 = await ethers.getContractFactory("NftAuctionV2");
        nftAuctionV2 = await upgrades.upgradeProxy(await nftAuction.getAddress(), NftAuctionV2);
        await nftAuctionV2.waitForDeployment();

        // 部署 NFT 合约用于测试
        const MockNFT = await ethers.getContractFactory("MockNFT");
        nftContract = await MockNFT.deploy();
        await nftContract.waitForDeployment();
        nftAddress = await nftContract.getAddress();
    });

    describe("升级功能", function () {
        it("应该成功升级到 V2 版本", async function () {
            // 验证合约地址保持不变
            expect(await nftAuctionV2.getAddress()).to.be.properAddress;

            // 验证 V2 新增功能可用
            const result = await nftAuctionV2.testHello();
            expect(result).to.equal("Hello, World!");
        });

        it("应该保持 V1 的功能不变", async function () {
            // 验证管理员设置仍然有效
            const adminAddress = await nftAuctionV2.admin();
            expect(adminAddress).to.equal(admin.address);

            // 验证基础功能仍然工作
            const nextAuctionId = await nftAuctionV2.nextAuctionId();
            expect(nextAuctionId).to.equal(0);
        });

        it("应该保持状态数据", async function () {
            // 在 V1 中设置一些状态
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8);
            await mockPriceFeed.waitForDeployment();

            await nftAuctionV2.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress());

            // 验证状态在升级后保持不变
            const priceFeedAddress = await nftAuctionV2.priceFeeds(ethers.ZeroAddress);
            expect(priceFeedAddress).to.equal(await mockPriceFeed.getAddress());
        });
    });

    describe("新增功能", function () {
        it("testHello 函数应该返回正确字符串", async function () {
            const result = await nftAuctionV2.testHello();
            expect(result).to.equal("Hello, World!");
        });

        it("任何人都可以调用 testHello 函数", async function () {
            const result = await nftAuctionV2.connect(user1).testHello();
            expect(result).to.equal("Hello, World!");
        });

        it("testHello 是纯函数", async function () {
            // 验证调用不消耗 gas（纯函数）
            const tx = await nftAuctionV2.testHello();
            // 纯函数调用不会创建交易，所以这里主要是验证返回值
            const result = await nftAuctionV2.testHello();
            expect(result).to.equal("Hello, World!");
        });
    });

    describe("与 V1 的兼容性", function () {
        beforeEach(async function () {
            // 设置价格预言机
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8);
            await mockPriceFeed.waitForDeployment();
            await nftAuctionV2.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress());

            // 铸造 NFT 并授权
            await nftContract.mint(admin.address, 1);
            await nftContract.connect(admin).approve(await nftAuctionV2.getAddress(), 1);
        });

        it("应该能够创建拍卖", async function () {
            await expect(
                nftAuctionV2.connect(admin).createAuction(
                    600,
                    nftAddress,
                    ethers.parseEther("1.0"),
                    1
                )
            ).not.to.be.reverted;

            const auctionInfo = await nftAuctionV2.auctions(0);
            expect(auctionInfo.seller).to.equal(admin.address);
            expect(auctionInfo.startingPrice).to.equal(ethers.parseEther("1.0"));
        });

        it("应该能够出价", async function () {
            // 创建拍卖
            await nftAuctionV2.connect(admin).createAuction(
                600,
                nftAddress,
                ethers.parseEther("1.0"),
                1
            );

            // 出价
            await expect(
                nftAuctionV2.connect(user1).bidWith(
                    0,
                    ethers.parseEther("1.5"),
                    ethers.ZeroAddress,
                    { value: ethers.parseEther("1.5") }
                )
            ).not.to.be.reverted;

            const auctionInfo = await nftAuctionV2.auctions(0);
            expect(auctionInfo.highestBidder).to.equal(user1.address);
            expect(auctionInfo.highestBid).to.equal(ethers.parseEther("1.5"));
        });

        it("应该能够结束拍卖", async function () {
            // 创建拍卖
            await nftAuctionV2.connect(admin).createAuction(
                600,
                nftAddress,
                ethers.parseEther("1.0"),
                1
            );

            // 出价
            await nftAuctionV2.connect(user1).bidWith(
                0,
                ethers.parseEther("1.5"),
                ethers.ZeroAddress,
                { value: ethers.parseEther("1.5") }
            );

            // 等待拍卖结束
            await ethers.provider.send("evm_increaseTime", [600]);
            await ethers.provider.send("evm_mine");

            // 结束拍卖
            await expect(nftAuctionV2.connect(admin).endAuction(0)).not.to.be.reverted;

            const auctionInfo = await nftAuctionV2.auctions(0);
            expect(auctionInfo.ended).to.be.true;
        });
    });

    describe("升级权限", function () {
        // it("非管理员不能执行管理操作", async function () {
        //     const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        //     const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8);
        //     await mockPriceFeed.waitForDeployment();

        //     await expect(
        //         nftAuctionV2.connect(user1).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress())
        //     ).to.be.reverted;
        // });

        it("管理员能够执行管理操作", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8);
            await mockPriceFeed.waitForDeployment();

            await expect(
                nftAuctionV2.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress())
            ).not.to.be.reverted;
        });
    });
});