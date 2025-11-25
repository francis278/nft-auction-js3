// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockPriceFeed is AggregatorV3Interface {
    uint80 private currentRoundId = 1;
    int256 private currentAnswer;
    uint256 private dataStartedAt;
    uint256 private dataUpdatedAt;
    uint80 private currentAnsweredInRound = 1;

    uint8 public override decimals = 8;
    string public override description = "Mock Price Feed";
    uint256 public override version = 1;

    constructor(int256 initialPrice) {
        currentAnswer = initialPrice;
        dataStartedAt = block.timestamp;
        dataUpdatedAt = block.timestamp;
    }

    function setPrice(int256 newPrice) external {
        currentAnswer = newPrice;
        currentRoundId++;
        dataUpdatedAt = block.timestamp;
        currentAnsweredInRound = currentRoundId;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (
            currentRoundId,
            currentAnswer,
            dataStartedAt,
            dataUpdatedAt,
            currentAnsweredInRound
        );
    }

    function getRoundData(
        uint80 roundIdParam // 修改参数名，避免遮蔽
    )
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        // 对于模拟合约，如果请求的 roundId 存在就返回数据，否则返回最新数据
        if (roundIdParam == currentRoundId) {
            return (
                currentRoundId,
                currentAnswer,
                dataStartedAt,
                dataUpdatedAt,
                currentAnsweredInRound
            );
        } else {
            // 如果请求的 roundId 不存在，返回0值（模拟数据不存在的情况）
            return (roundIdParam, 0, 0, 0, roundIdParam);
        }
    }
}
