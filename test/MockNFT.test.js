const { expect } = require("chai");

describe("MockNFT", function () {
    let mockNFT;
    let owner, user1, user2;

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();

        const MockNFT = await ethers.getContractFactory("MockNFT");
        mockNFT = await MockNFT.deploy();
        await mockNFT.waitForDeployment();
    });

    describe("部署和初始化", function () {
        it("应该正确设置名称和符号", async function () {
            expect(await mockNFT.name()).to.equal("MockNFT");
            expect(await mockNFT.symbol()).to.equal("MNFT");
        });

        it("应该设置部署者为所有者", async function () {
            expect(await mockNFT.owner()).to.equal(owner.address);
        });

        it("应该正确初始化nextTokenId", async function () {
            expect(await mockNFT.getNextTokenId()).to.equal(1);
        });
    });

    describe("mint函数", function () {
        it("应该允许铸造指定tokenId的NFT", async function () {
            const tokenId = 123;

            await expect(mockNFT.mint(user1.address, tokenId))
                .to.emit(mockNFT, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, tokenId);

            expect(await mockNFT.ownerOf(tokenId)).to.equal(user1.address);
            expect(await mockNFT.balanceOf(user1.address)).to.equal(1);
        });

        it("应该允许铸造多个不同tokenId的NFT", async function () {
            await mockNFT.mint(user1.address, 1);
            await mockNFT.mint(user1.address, 2);
            await mockNFT.mint(user2.address, 3);

            expect(await mockNFT.ownerOf(1)).to.equal(user1.address);
            expect(await mockNFT.ownerOf(2)).to.equal(user1.address);
            expect(await mockNFT.ownerOf(3)).to.equal(user2.address);
            expect(await mockNFT.balanceOf(user1.address)).to.equal(2);
            expect(await mockNFT.balanceOf(user2.address)).to.equal(1);
        });

    });

    describe("safeMint函数", function () {

        it("safeMint应该触发Transfer事件", async function () {
            await expect(mockNFT.safeMint(user1.address))
                .to.emit(mockNFT, "Transfer")
                .withArgs(ethers.ZeroAddress, user1.address, 1);
        });
    });

    describe("所有权功能", function () {
        it("应该支持ERC721标准接口", async function () {
            await mockNFT.mint(user1.address, 1);

            // 测试基本的ERC721功能
            expect(await mockNFT.tokenURI(1)).to.equal(""); // 默认空字符串
            expect(await mockNFT.balanceOf(user1.address)).to.equal(1);
            expect(await mockNFT.ownerOf(1)).to.equal(user1.address);
        });

        it("应该支持所有权转移", async function () {
            await mockNFT.mint(user1.address, 1);

            await mockNFT.connect(user1).transferFrom(user1.address, user2.address, 1);

            expect(await mockNFT.ownerOf(1)).to.equal(user2.address);
            expect(await mockNFT.balanceOf(user1.address)).to.equal(0);
            expect(await mockNFT.balanceOf(user2.address)).to.equal(1);
        });
    });
});