const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("NFT Auction Market", function () {

    let auction, nftContract, nftAddress;
    let admin, owner, seller, bidder1, bidder2;
    let auctionId;
    const tokenId = 1;
    const startingPrice = ethers.parseEther("1.0");
    const duration = 600;

    // 测试用的价格预言机模拟合约
    let mockPriceFeed;

    beforeEach(async function () {

        // 获取测试账户
        [admin, seller, bidder1, bidder2] = await ethers.getSigners();

        // 部署NFT合约
        const MockNFT = await ethers.getContractFactory("MockNFT");
        nftContract = await MockNFT.deploy();
        await nftContract.waitForDeployment();
        nftAddress = await nftContract.getAddress();

        // ==================== 【修改点1】给管理员铸造NFT ====================
        await nftContract.mint(admin.address, tokenId);

        // 部署拍卖合约 - 使用可升级合约部署方式
        const NftAuctionContract = await ethers.getContractFactory("NftAuction");

        // ==================== 【修改点2】使用 upgrades.deployProxy 部署 ====================
        auction = await upgrades.deployProxy(NftAuctionContract, [], {
            initializer: "initialize"
        });
        await auction.waitForDeployment();

        // ==================== 【修改点3】NFT授权 ====================
        await nftContract.connect(admin).approve(await auction.getAddress(), tokenId);

        auctionId = 0;
    });

    describe("拍卖创建", function () {

        it("非管理员不能创建拍卖", async function () {
            await expect(
                auction.connect(bidder1).createAuction(
                    duration,        // uint256 _duration
                    nftAddress,      // address _nftAddress
                    startingPrice,   // uint256 _startingPrice
                    tokenId          // uint256 _tokenId
                )
            ).to.be.revertedWith("Only admin can create auctions");
        });

        it("持续时间必须大于10秒", async function () {
            const shortDuration = 5;
            await expect(
                auction.connect(admin).createAuction(
                    shortDuration,        // uint256 _duration
                    nftAddress,      // address _nftAddress
                    startingPrice,   // uint256 _startingPrice
                    tokenId          // uint256 _tokenId
                )
            ).to.be.revertedWith("Duration must be greater than 10s");
        });

        it("起始价格必须大于0", async function () {
            const startingPriceZero = 0;
            await expect(
                auction.connect(admin).createAuction(
                    duration,        // uint256 _duration
                    nftAddress,      // address _nftAddress
                    startingPriceZero,   // uint256 _startingPrice
                    tokenId          // uint256 _tokenId
                )
            ).to.be.revertedWith("Starting price must be greater than 0");
        });

        it("应该正确将NFT转移到合约", async function () {
            // 创建拍卖前，NFT属于管理员
            expect(await nftContract.ownerOf(tokenId)).to.equal(admin.address);

            // 管理员创建拍卖
            await auction.connect(admin).createAuction(
                duration,
                nftAddress,
                startingPrice,
                tokenId
            );

            // 创建拍卖后，NFT应该转移到合约地址
            expect(await nftContract.ownerOf(tokenId)).to.equal(await auction.getAddress());

            // 获取存储的拍卖信息
            const auctionInfo = await auction.auctions(0);

            // 验证所有字段是否正确存储
            expect(auctionInfo.seller).to.equal(admin.address);
            expect(auctionInfo.duration).to.equal(duration);
            expect(auctionInfo.startingPrice).to.equal(startingPrice);
            expect(auctionInfo.startTime).to.be.gt(0); // 开始时间应该大于0
            expect(auctionInfo.ended).to.be.false;
            expect(auctionInfo.highestBidder).to.equal(ethers.ZeroAddress);
            expect(auctionInfo.highestBid).to.equal(0);
            expect(auctionInfo.nftContract).to.equal(nftAddress);
            expect(auctionInfo.tokenId).to.equal(tokenId);
            expect(auctionInfo.tokenAddress).to.equal(ethers.ZeroAddress);
        });
    });


    describe("ETH出价", function () {
        it("应该允许用户用ETH出价", async function () {
            // 1. 先部署并设置价格预言机
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");

            // 部署时直接设置价格：1 ETH = 2000 USD (2000 * 10^8)
            const ethPrice = 2000 * 10 ** 8;
            const mockPriceFeed = await MockPriceFeed.deploy(ethPrice);
            await mockPriceFeed.waitForDeployment();

            console.log("MockPriceFeed 部署地址:", await mockPriceFeed.getAddress());

            // 2. 设置价格预言机到拍卖合约
            const setTx = await auction.connect(admin).setPriceFeed(
                ethers.ZeroAddress,  // address(0) 代表ETH
                await mockPriceFeed.getAddress()
            );
            await setTx.wait();
            console.log("价格预言机设置完成");

            // 3. 创建拍卖
            const createTx = await auction.connect(admin).createAuction(
                86400,
                nftAddress,
                startingPrice,  // 1 ETH
                tokenId
            );
            await createTx.wait();
            console.log("拍卖创建完成");

            // 4. 验证价格预言机工作
            const price = await auction.getChainlinkDataFeedLatestAnswer(ethers.ZeroAddress);
            console.log("ETH/USD 价格:", price.toString());

            // 5. 计算需要的出价金额
            // 起拍价: 1 ETH = 2000 USD
            // 需要出价 > 1 ETH，比如 1.1 ETH = 2200 USD
            const bidAmount = ethers.parseEther("1.1");
            console.log("出价金额:", bidAmount.toString());

            // 6. 进行出价
            try {
                const bidTx = await auction.connect(bidder1).bidWith(
                    0,  // 拍卖ID
                    bidAmount,
                    ethers.ZeroAddress,
                    { value: bidAmount }
                );
                await bidTx.wait();
                console.log("✅ 出价成功");
            } catch (error) {
                console.log("❌ 出价失败:", error);
                // 打印详细错误信息
                if (error.receipt) {
                    console.log("交易回执:", error.receipt);
                }
                throw error;
            }

            // 7. 验证结果
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.highestBidder).to.equal(bidder1.address);
            expect(auctionInfo.highestBid).to.equal(bidAmount);
        });
    });

    describe("结束拍卖", function () {
        let mockPriceFeed;
        const bidAmount = ethers.parseEther("2.0");

        beforeEach(async function () {
            // 部署并设置价格预言机
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const ethPrice = 2000 * 10 ** 8;
            mockPriceFeed = await MockPriceFeed.deploy(ethPrice);
            await mockPriceFeed.waitForDeployment();

            // 设置价格预言机
            await auction.connect(admin).setPriceFeed(
                ethers.ZeroAddress,
                await mockPriceFeed.getAddress()
            );

            // 创建拍卖
            await auction.connect(admin).createAuction(
                600, // 10分钟持续时间
                nftAddress,
                startingPrice,
                tokenId
            );
        });

        it("应该允许在拍卖结束后结束拍卖", async function () {
            // 先进行出价
            await auction.connect(bidder1).bidWith(
                0,
                bidAmount,
                ethers.ZeroAddress,
                { value: bidAmount }
            );

            // 验证拍卖状态
            let auctionInfo = await auction.auctions(0);
            expect(auctionInfo.ended).to.be.false;
            expect(await nftContract.ownerOf(tokenId)).to.equal(await auction.getAddress());

            // 等待拍卖结束（增加时间）
            await ethers.provider.send("evm_increaseTime", [600]); // 增加600秒
            await ethers.provider.send("evm_mine"); // 挖一个新块

            // 结束拍卖
            await auction.connect(admin).endAuction(0);

            // 验证拍卖状态
            auctionInfo = await auction.auctions(0);
            expect(auctionInfo.ended).to.be.true;

            // 验证NFT所有权转移
            expect(await nftContract.ownerOf(tokenId)).to.equal(bidder1.address);
        });

        // it("非管理员不能结束拍卖", async function () {
        //     // 先进行出价
        //     await auction.connect(bidder1).bidWith(
        //         0,
        //         bidAmount,
        //         ethers.ZeroAddress,
        //         { value: bidAmount }
        //     );

        //     // 等待拍卖结束
        //     await ethers.provider.send("evm_increaseTime", [600]);
        //     await ethers.provider.send("evm_mine");

        //     await expect(
        //         auction.connect(bidder1).endAuction(0)
        //     ).to.be.reverted; // 应该被拒绝
        // });

        it("不能在拍卖未结束时结束拍卖", async function () {
            // 进行出价
            await auction.connect(bidder1).bidWith(
                0,
                bidAmount,
                ethers.ZeroAddress,
                { value: bidAmount }
            );

            // 不增加时间，拍卖还在进行中
            await expect(
                auction.connect(admin).endAuction(0)
            ).to.be.revertedWith("Auction has not ended");
        });

        it("不能重复结束已结束的拍卖", async function () {
            // 进行出价
            await auction.connect(bidder1).bidWith(
                0,
                bidAmount,
                ethers.ZeroAddress,
                { value: bidAmount }
            );

            // 等待拍卖结束并结束第一次
            await ethers.provider.send("evm_increaseTime", [600]);
            await ethers.provider.send("evm_mine");
            await auction.connect(admin).endAuction(0);

            // 尝试再次结束
            await expect(
                auction.connect(admin).endAuction(0)
            ).to.be.revertedWith("Auction has not ended");
        });

        // it("如果无人出价，NFT应返还给卖家", async function () {
        //     // 铸造新的NFT用于测试
        //     const newTokenId = 2;
        //     await nftContract.mint(admin.address, newTokenId);
        //     await nftContract.connect(admin).approve(await auction.getAddress(), newTokenId);

        //     // 创建新拍卖
        //     await auction.connect(admin).createAuction(
        //         600,
        //         nftAddress,
        //         startingPrice,
        //         newTokenId
        //     );

        //     // 等待拍卖结束（无人出价）
        //     await ethers.provider.send("evm_increaseTime", [600]);
        //     await ethers.provider.send("evm_mine");

        //     // 结束拍卖
        //     await auction.connect(admin).endAuction(1);

        //     // 验证NFT返还给卖家（管理员）
        //     expect(await nftContract.ownerOf(newTokenId)).to.equal(admin.address);
        // });

        it("结束拍卖后资金应转移给卖家", async function () {
            // 记录卖家初始余额
            const initialSellerBalance = await ethers.provider.getBalance(admin.address);

            // 进行出价
            const bidTx = await auction.connect(bidder1).bidWith(
                0,
                bidAmount,
                ethers.ZeroAddress,
                { value: bidAmount }
            );
            const receipt = await bidTx.wait();
            const gasUsed = receipt.gasUsed * receipt.gasPrice;

            // 等待拍卖结束
            await ethers.provider.send("evm_increaseTime", [600]);
            await ethers.provider.send("evm_mine");

            // 结束拍卖
            await auction.connect(admin).endAuction(0);

            // 验证卖家收到资金（考虑gas费用）
            const finalSellerBalance = await ethers.provider.getBalance(admin.address);
            // 卖家应该收到出价金额，但由于gas费用，余额变化可能不是精确的bidAmount
            expect(finalSellerBalance).to.be.gt(initialSellerBalance);
        });
    });



    describe("合约升级权限", function () {
        it("应该正确设置管理员", async function () {
            // 验证管理员地址正确设置
            const adminAddress = await auction.admin();
            expect(adminAddress).to.equal(admin.address);
        });

        it("管理员能够执行管理操作", async function () {
            // 测试管理员可以设置价格预言机
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8);
            await mockPriceFeed.waitForDeployment();

            // 管理员应该能够成功设置
            await expect(
                auction.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress())
            ).not.to.be.reverted;
        });

        // it("非管理员不能执行管理操作", async function () {
        //     const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        //     const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8);
        //     await mockPriceFeed.waitForDeployment();

        //     // 非管理员应该被拒绝
        //     await expect(
        //         auction.connect(bidder1).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress())
        //     ).to.be.reverted;
        // });
    });




    describe("ERC20支付结束拍卖", function () {
        let mockERC20, mockPriceFeed;

        beforeEach(async function () {
            // 部署ERC20代币和价格预言机
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            mockERC20 = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000"));
            await mockERC20.waitForDeployment();

            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(1 * 10 ** 8);
            await mockPriceFeed.waitForDeployment();

            // 设置ERC20的价格预言机
            await auction.connect(admin).setPriceFeed(
                await mockERC20.getAddress(),
                await mockPriceFeed.getAddress()
            );

            // 设置ETH的价格预言机
            await auction.connect(admin).setPriceFeed(
                ethers.ZeroAddress,
                await mockPriceFeed.getAddress()
            );

            // 创建拍卖
            await auction.connect(admin).createAuction(
                600,
                nftAddress,
                ethers.parseEther("100"),
                tokenId
            );
        });

        it("应该用ERC20支付结束拍卖", async function () {
            // 先做一个很小的ETH出价来设置tokenAddress
            await auction.connect(bidder2).bidWith(
                0,
                ethers.parseEther("0.1"),
                ethers.ZeroAddress,
                { value: ethers.parseEther("0.1") }
            );

            // 给bidder1转账并授权
            await mockERC20.connect(admin).transfer(bidder1.address, ethers.parseEther("200"));
            await mockERC20.connect(bidder1).approve(await auction.getAddress(), ethers.parseEther("150"));

            // 用ERC20出价覆盖
            await auction.connect(bidder1).bidWith(
                0,
                ethers.parseEther("150"),
                await mockERC20.getAddress()
            );

            // 等待拍卖结束
            await ethers.provider.send("evm_increaseTime", [600]);
            await ethers.provider.send("evm_mine");

            // 结束拍卖
            await auction.connect(admin).endAuction(0);

            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.ended).to.be.true;
        });
    });
});