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

    });

    describe("ERC20转账分支", function () {
        let mockERC20, mockPriceFeed;

        beforeEach(async function () {
            // 部署ERC20代币
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            mockERC20 = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000"));
            await mockERC20.waitForDeployment();

            // 部署价格预言机
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(1 * 10 ** 8); // 1:1 价格
            await mockPriceFeed.waitForDeployment();

            // 设置价格预言机（ETH和ERC20都用同一个）
            await auction.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress());
            await auction.connect(admin).setPriceFeed(await mockERC20.getAddress(), await mockPriceFeed.getAddress());

            // 创建拍卖
            await auction.connect(admin).createAuction(
                600,
                nftAddress,
                ethers.parseEther("100"),
                tokenId
            );

            // 给bidder1转账ERC20代币
            await mockERC20.connect(admin).transfer(bidder1.address, ethers.parseEther("200"));
        });

        it("应该执行ERC20 transferFrom分支", async function () {
            // 授权拍卖合约使用代币
            await mockERC20.connect(bidder1).approve(await auction.getAddress(), ethers.parseEther("150"));

            // 记录初始余额
            const initialBidderBalance = await mockERC20.balanceOf(bidder1.address);
            const initialContractBalance = await mockERC20.balanceOf(await auction.getAddress());

            // 使用ERC20出价 - 这会进入ERC20 transferFrom分支
            await auction.connect(bidder1).bidWith(
                0,
                ethers.parseEther("150"),
                await mockERC20.getAddress()
            );

            // 验证ERC20转账成功
            const finalBidderBalance = await mockERC20.balanceOf(bidder1.address);
            const finalContractBalance = await mockERC20.balanceOf(await auction.getAddress());

            expect(finalBidderBalance).to.equal(initialBidderBalance - ethers.parseEther("150"));
            expect(finalContractBalance).to.equal(initialContractBalance + ethers.parseEther("150"));
        });
    });

    describe("ERC20退款分支", function () {
        let mockERC20, mockPriceFeed;

        beforeEach(async function () {
            // 部署ERC20代币
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            mockERC20 = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000"));
            await mockERC20.waitForDeployment();

            // 部署价格预言机
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(1 * 10 ** 8); // 1:1 价格
            await mockPriceFeed.waitForDeployment();

            // 设置价格预言机
            await auction.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress());
            await auction.connect(admin).setPriceFeed(await mockERC20.getAddress(), await mockPriceFeed.getAddress());

            // 创建拍卖
            await auction.connect(admin).createAuction(
                600,
                nftAddress,
                ethers.parseEther("100"),
                tokenId
            );

            // 给两个出价者转账ERC20代币
            await mockERC20.connect(admin).transfer(bidder1.address, ethers.parseEther("200"));
            await mockERC20.connect(admin).transfer(bidder2.address, ethers.parseEther("200"));
        });

        it("应该执行ERC20退款分支", async function () {
            // 记录初始余额
            const initialBidder1Balance = await mockERC20.balanceOf(bidder1.address);
            console.log("bidder1初始余额:", initialBidder1Balance.toString());

            // 第一个出价者授权并出价
            await mockERC20.connect(bidder1).approve(await auction.getAddress(), ethers.parseEther("120"));
            await auction.connect(bidder1).bidWith(
                0,
                ethers.parseEther("120"),
                await mockERC20.getAddress()
            );

            // 第一次出价后的余额
            const afterFirstBidBalance = await mockERC20.balanceOf(bidder1.address);
            console.log("第一次出价后余额:", afterFirstBidBalance.toString());

            // 第二个出价者授权并用更高价出价 - 这会触发ERC20退款分支
            await mockERC20.connect(bidder2).approve(await auction.getAddress(), ethers.parseEther("150"));
            await auction.connect(bidder2).bidWith(
                0,
                ethers.parseEther("150"),
                await mockERC20.getAddress()
            );

            // 最终余额
            const finalBidder1Balance = await mockERC20.balanceOf(bidder1.address);
            console.log("第二次出价后余额:", finalBidder1Balance.toString());

            // 验证第一个出价者收到了ERC20退款
            // 期望：初始余额 - 第一次出价 + 退款 = 初始余额
            expect(finalBidder1Balance).to.equal(initialBidder1Balance);

            // 验证第二个出价者成为新的最高出价者
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.highestBidder).to.equal(bidder2.address);
            expect(auctionInfo.highestBid).to.equal(ethers.parseEther("150"));
        });
    });

    describe("ETH退款分支", function () {
        let mockPriceFeed;

        beforeEach(async function () {
            // 部署价格预言机
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(1 * 10 ** 8); // 1:1 价格
            await mockPriceFeed.waitForDeployment();

            // 设置ETH价格预言机
            await auction.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress());

            // 创建拍卖
            await auction.connect(admin).createAuction(
                600,
                nftAddress,
                ethers.parseEther("1.0"),
                tokenId
            );
        });

        it("应该执行ETH退款分支", async function () {
            // 记录第一个出价者初始余额
            const initialBidder1Balance = await ethers.provider.getBalance(bidder1.address);

            // 第一个出价者用ETH出价
            const firstBidAmount = ethers.parseEther("1.5");
            const bidTx1 = await auction.connect(bidder1).bidWith(
                0,
                firstBidAmount,
                ethers.ZeroAddress,
                { value: firstBidAmount }
            );
            const receipt1 = await bidTx1.wait();
            const gasUsed1 = receipt1.gasUsed * receipt1.gasPrice;

            // 第一次出价后的余额（考虑gas费用）
            const afterFirstBidBalance = await ethers.provider.getBalance(bidder1.address);

            // 记录第二个出价者初始余额
            const initialBidder2Balance = await ethers.provider.getBalance(bidder2.address);

            // 第二个出价者用更高价ETH出价 - 这会触发ETH退款分支
            const secondBidAmount = ethers.parseEther("2.0");
            const bidTx2 = await auction.connect(bidder2).bidWith(
                0,
                secondBidAmount,
                ethers.ZeroAddress,
                { value: secondBidAmount }
            );
            const receipt2 = await bidTx2.wait();
            const gasUsed2 = receipt2.gasUsed * receipt2.gasPrice;

            // 最终余额
            const finalBidder1Balance = await ethers.provider.getBalance(bidder1.address);
            const finalBidder2Balance = await ethers.provider.getBalance(bidder2.address);

            console.log("bidder1初始余额:", ethers.formatEther(initialBidder1Balance));
            console.log("bidder1第一次出价后余额:", ethers.formatEther(afterFirstBidBalance));
            console.log("bidder1最终余额:", ethers.formatEther(finalBidder1Balance));
            console.log("bidder2初始余额:", ethers.formatEther(initialBidder2Balance));
            console.log("bidder2最终余额:", ethers.formatEther(finalBidder2Balance));

            // 验证第一个出价者收到了ETH退款（考虑gas费用）
            // 期望：最终余额 ≈ 初始余额 - 两次交易的gas费用
            const expectedBidder1Balance = initialBidder1Balance - gasUsed1;
            expect(finalBidder1Balance).to.be.closeTo(expectedBidder1Balance, ethers.parseEther("0.01"));

            // 验证第二个出价者成为新的最高出价者
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.highestBidder).to.equal(bidder2.address);
            expect(auctionInfo.highestBid).to.equal(secondBidAmount);
        });
    });

    describe("ERC20支付给卖家", function () {
        let mockERC20, mockPriceFeed;

        beforeEach(async function () {
            // 部署ERC20代币
            const MockERC20 = await ethers.getContractFactory("MockERC20");
            mockERC20 = await MockERC20.deploy("Test Token", "TEST", ethers.parseEther("1000"));
            await mockERC20.waitForDeployment();

            // 部署价格预言机
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(1 * 10 ** 8); // 1:1 价格
            await mockPriceFeed.waitForDeployment();

            // 设置价格预言机
            await auction.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress());
            await auction.connect(admin).setPriceFeed(await mockERC20.getAddress(), await mockPriceFeed.getAddress());

            // 创建拍卖
            await auction.connect(admin).createAuction(
                600,
                nftAddress,
                ethers.parseEther("100"),
                tokenId
            );

            // 给bidder1转账ERC20代币
            await mockERC20.connect(admin).transfer(bidder1.address, ethers.parseEther("200"));
        });

        it("应该执行ERC20支付给卖家分支", async function () {
            // 记录卖家初始余额
            const initialSellerBalance = await mockERC20.balanceOf(admin.address);

            // 出价者授权并出价
            await mockERC20.connect(bidder1).approve(await auction.getAddress(), ethers.parseEther("150"));
            await auction.connect(bidder1).bidWith(
                0,
                ethers.parseEther("150"),
                await mockERC20.getAddress()
            );

            // 等待拍卖结束
            await ethers.provider.send("evm_increaseTime", [600]);
            await ethers.provider.send("evm_mine");

            // 记录拍卖合约余额
            const contractBalanceBefore = await mockERC20.balanceOf(await auction.getAddress());

            // 结束拍卖 - 这会触发ERC20支付给卖家分支
            await auction.connect(admin).endAuction(0);

            // 验证卖家收到了ERC20代币
            const finalSellerBalance = await mockERC20.balanceOf(admin.address);
            expect(finalSellerBalance).to.equal(initialSellerBalance + ethers.parseEther("150"));

            // 验证拍卖合约的ERC20余额减少
            const contractBalanceAfter = await mockERC20.balanceOf(await auction.getAddress());
            expect(contractBalanceAfter).to.equal(contractBalanceBefore - ethers.parseEther("150"));

            // 验证拍卖已结束
            const auctionInfo = await auction.auctions(0);
            expect(auctionInfo.ended).to.be.true;

            // 验证NFT转移
            expect(await nftContract.ownerOf(tokenId)).to.equal(bidder1.address);
        });
    });

    //////
    describe("合约升级权限", function () {
        it("应该正确设置管理员", async function () {
            // 验证管理员地址正确设置
            const adminAddress = await auction.admin();
            expect(adminAddress).to.equal(admin.address);
        });

        // it("非管理员不能设置价格预言机", async function () {
        //     const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
        //     const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8);
        //     await mockPriceFeed.waitForDeployment();

        //     // 非管理员应该被拒绝
        //     await expect(
        //         auction.connect(bidder1).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress())
        //     ).to.be.reverted;
        // });

        it("管理员能够设置价格预言机", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            const mockPriceFeed = await MockPriceFeed.deploy(2000 * 10 ** 8);
            await mockPriceFeed.waitForDeployment();

            // 管理员应该能够成功设置
            await expect(
                auction.connect(admin).setPriceFeed(ethers.ZeroAddress, await mockPriceFeed.getAddress())
            ).not.to.be.reverted;
        });
    });
});