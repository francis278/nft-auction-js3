const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("MockPriceFeed", function () {
    let mockPriceFeed;
    let owner, user1;

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();
    });

    describe("部署和初始化", function () {
        it("应该使用初始价格正确部署", async function () {
            const initialPrice = 2000 * 10 ** 8; // 2000 USD 带8位小数
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(initialPrice);
            await mockPriceFeed.waitForDeployment();

            expect(await mockPriceFeed.decimals()).to.equal(8);
            expect(await mockPriceFeed.description()).to.equal("Mock Price Feed");
            expect(await mockPriceFeed.version()).to.equal(1);
        });

        it("应该正确设置初始价格", async function () {
            const initialPrice = 1500 * 10 ** 8;
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(initialPrice);
            await mockPriceFeed.waitForDeployment();

            const latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(initialPrice);
        });
    });

    describe("latestRoundData函数", function () {
        beforeEach(async function () {
            const initialPrice = 1800 * 10 ** 8;
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(initialPrice);
            await mockPriceFeed.waitForDeployment();
        });

        it("应该返回正确的数据结构", async function () {
            const [roundId, answer, startedAt, updatedAt, answeredInRound] = await mockPriceFeed.latestRoundData();

            expect(roundId).to.equal(1);
            expect(answer).to.equal(1800 * 10 ** 8);
            expect(startedAt).to.be.gt(0);
            expect(updatedAt).to.be.gt(0);
            expect(answeredInRound).to.equal(1);
        });

        it("应该返回正确的数据类型", async function () {
            const latestData = await mockPriceFeed.latestRoundData();

            expect(typeof latestData.roundId).to.equal("bigint");
            expect(typeof latestData.answer).to.equal("bigint");
            expect(typeof latestData.startedAt).to.equal("bigint");
            expect(typeof latestData.updatedAt).to.equal("bigint");
            expect(typeof latestData.answeredInRound).to.equal("bigint");
        });
    });

    describe("setPrice函数", function () {
        beforeEach(async function () {
            const initialPrice = 1000 * 10 ** 8;
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(initialPrice);
            await mockPriceFeed.waitForDeployment();
        });

        it("应该允许更新价格", async function () {
            const newPrice = 2500 * 10 ** 8;
            await mockPriceFeed.setPrice(newPrice);

            const latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(newPrice);
        });

        it("应该递增roundId", async function () {
            const initialData = await mockPriceFeed.latestRoundData();
            expect(initialData.roundId).to.equal(1);

            await mockPriceFeed.setPrice(2000 * 10 ** 8);
            const newData = await mockPriceFeed.latestRoundData();
            expect(newData.roundId).to.equal(2);
        });

        it("应该更新时间戳", async function () {
            const initialData = await mockPriceFeed.latestRoundData();
            const initialUpdatedAt = initialData.updatedAt;

            // 等待一小段时间
            await ethers.provider.send("evm_increaseTime", [10]);
            await ethers.provider.send("evm_mine");

            await mockPriceFeed.setPrice(2000 * 10 ** 8);
            const newData = await mockPriceFeed.latestRoundData();

            expect(newData.updatedAt).to.be.gt(initialUpdatedAt);
        });

        it("任何人都可以调用setPrice", async function () {
            const newPrice = 3000 * 10 ** 8;
            await mockPriceFeed.connect(user1).setPrice(newPrice);

            const latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(newPrice);
        });
    });

    describe("getRoundData函数", function () {
        beforeEach(async function () {
            const initialPrice = 1200 * 10 ** 8;
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(initialPrice);
            await mockPriceFeed.waitForDeployment();
        });

        it("应该为存在的roundId返回数据", async function () {
            const [roundId, answer, startedAt, updatedAt, answeredInRound] = await mockPriceFeed.getRoundData(1);

            expect(roundId).to.equal(1);
            expect(answer).to.equal(1200 * 10 ** 8);
            expect(startedAt).to.be.gt(0);
            expect(updatedAt).to.be.gt(0);
            expect(answeredInRound).to.equal(1);
        });

        it("应该为不存在的roundId返回0值", async function () {
            const [roundId, answer, startedAt, updatedAt, answeredInRound] = await mockPriceFeed.getRoundData(999);

            expect(roundId).to.equal(999);
            expect(answer).to.equal(0);
            expect(startedAt).to.equal(0);
            expect(updatedAt).to.equal(0);
            expect(answeredInRound).to.equal(999);
        });

        // it("在价格更新后应该正确处理round数据", async function () {
        //     // 获取初始round数据
        //     const initialRoundData = await mockPriceFeed.getRoundData(1);
        //     expect(initialRoundData.answer).to.equal(1200 * 10 ** 8);

        //     // 更新价格创建新round
        //     await mockPriceFeed.setPrice(1500 * 10 ** 8);

        //     // 旧round数据应该保持不变
        //     const oldRoundData = await mockPriceFeed.getRoundData(1);
        //     expect(oldRoundData.answer).to.equal(1200 * 10 ** 8);

        //     // 新round数据应该正确
        //     const newRoundData = await mockPriceFeed.getRoundData(2);
        //     expect(newRoundData.answer).to.equal(1500 * 10 ** 8);
        // });
    });

    describe("多次价格更新", function () {
        it("应该正确处理连续的价格更新", async function () {
            const initialPrice = 1000 * 10 ** 8;
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(initialPrice);
            await mockPriceFeed.waitForDeployment();

            // 第一次更新
            await mockPriceFeed.setPrice(2000 * 10 ** 8);
            let latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(2000 * 10 ** 8);
            expect(latestData.roundId).to.equal(2);

            // 第二次更新
            await mockPriceFeed.setPrice(3000 * 10 ** 8);
            latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(3000 * 10 ** 8);
            expect(latestData.roundId).to.equal(3);

            // 第三次更新
            await mockPriceFeed.setPrice(2500 * 10 ** 8);
            latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(2500 * 10 ** 8);
            expect(latestData.roundId).to.equal(4);
        });
    });

    describe("边界情况", function () {
        it("应该处理零价格", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(0);
            await mockPriceFeed.waitForDeployment();

            const latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(0);
        });

        it("应该处理负价格", async function () {
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(-100 * 10 ** 8);
            await mockPriceFeed.waitForDeployment();

            const latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(-100 * 10 ** 8);
        });

        it("应该处理非常大的价格", async function () {
            const largePrice = BigInt("1000000000000000000"); // 非常大的数
            const MockPriceFeed = await ethers.getContractFactory("MockPriceFeed");
            mockPriceFeed = await MockPriceFeed.deploy(largePrice);
            await mockPriceFeed.waitForDeployment();

            const latestData = await mockPriceFeed.latestRoundData();
            expect(latestData.answer).to.equal(largePrice);
        });
    });
});