// SPDX-License-Identifier: MIT
pragma solidity ^0.8;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract NftAuction is Initializable, UUPSUpgradeable {
    // 结构体
    struct Auction {
        // 卖家
        address seller;
        // 拍卖持续时间
        uint256 duration;
        // 起拍价
        uint256 startingPrice;
        // 拍卖开始时间
        uint256 startTime;
        // 拍卖是否结束
        bool ended;
        // 当前最高出价者
        address highestBidder;
        // 当前最高出价
        uint256 highestBid;
        // NFT合约地址
        address nftContract;
        // 被拍卖的NFT的tokenId
        uint256 tokenId;
        // 参与竞价的资产类型 0x 地址表示eth，其他地址表示erc20
        // 0x0000000000000000000000000000000000000000 表示eth
        address tokenAddress;
        // 拍卖标识
        // uint256 id; // 拍卖ID
        // 拍卖结束时间
        //uint256 endTime;
        // // 扩展功能
        // uint256 minBidIncrement; // 最小加价幅度
        // address paymentToken; // 支付代币地址（ETH = address(0)）
        // bool canceled; // 是否被取消
    }

    // 核心映射
    mapping(uint256 => Auction) public auctions;
    // 下一个拍卖ID
    uint256 public nextAuctionId;
    // 管理员地址
    address public admin;

    mapping(address => AggregatorV3Interface) public priceFeeds;

    function initialize() public initializer {
        admin = msg.sender;
    }

    function setPriceFeed(address tokenAddress, address _priceFeed) public {
        priceFeeds[tokenAddress] = AggregatorV3Interface(_priceFeed);
    }

    // ETH -> USD => 1766 7512 1800 => 1766.75121800
    // USDC -> USD => 9999 4000 => 0.99994000
    // 函数定义：获取 Chainlink 数据源的最新价格
    // 这是一个公共视图函数，只读取数据不修改状态
    function getChainlinkDataFeedLatestAnswer(
        address tokenAddress // 输入参数：代币地址，用于查找对应的价格预言机
    ) public view returns (int) {
        // 返回类型：int256，表示价格（通常带8位小数）
        // 从 priceFeeds 映射中获取对应代币的 Chainlink 价格预言机合约接口
        // priceFeeds 是一个状态变量：mapping(address => AggregatorV3Interface)
        // 例如：priceFeeds[address(0)] 可能对应 ETH/USD 价格预言机
        // priceFeeds[USDC地址] 可能对应 USDC/USD 价格预言机
        AggregatorV3Interface priceFeed = priceFeeds[tokenAddress];

        // 调用 Chainlink 预言机的 latestRoundData() 方法获取最新价格数据
        // 使用 prettier-ignore 注释阻止代码格式化工具调整这个多行元组解构的格式
        // prettier-ignore
        (
        /* uint80 roundId */,     // 忽略：价格更新轮次ID
        int256 answer,           // 保留：我们需要的价格答案
        /*uint256 startedAt*/,   // 忽略：该轮次开始时间
        /*uint256 updatedAt*/,   // 忽略：价格最后更新时间  
        /*uint80 answeredInRound*/ // 忽略：回答所在的轮次
    ) = priceFeed.latestRoundData(); // 调用预言机合约获取数据

        // 返回从预言机获取的价格答案
        // 这个 answer 通常表示：代币对美元的价格，带8位小数
        // 例如：如果 ETH = $2000，answer = 2000 * 10^8 = 200000000000
        return answer;
    }

    // 1. 创建拍卖
    function createAuction(
        uint256 _duration,
        address _nftAddress,
        uint256 _startingPrice,
        uint256 _tokenId
    ) public {
        // 只有管理员可以创建拍卖
        require(msg.sender == admin, "Only admin can create auctions");
        require(_duration >= 10, "Duration must be greater than 10s");
        require(_startingPrice > 0, "Starting price must be greater than 0");

        // 转移NFT到合约
        IERC721(_nftAddress).safeTransferFrom(
            msg.sender,
            address(this),
            _tokenId
        );

        auctions[nextAuctionId] = Auction({
            seller: msg.sender,
            duration: _duration,
            startingPrice: _startingPrice,
            startTime: block.timestamp,
            ended: false,
            highestBidder: address(0),
            highestBid: 0,
            nftContract: _nftAddress,
            tokenId: _tokenId,
            tokenAddress: address(0)
        });
        nextAuctionId++;
    }

    // 2. 出价
    function bidWith(
        uint256 _auctionID, // 输入参数：拍卖的唯一ID，调用者传入，用于标识要参与哪个拍卖
        uint256 amount, // 输入参数：出价金额，调用者传入
        address _tokenAddress // 输入参数：支付代币地址，调用者传入。address(0)表示用ETH，其他地址表示用ERC20代币
    ) public payable {
        Auction storage auction = auctions[_auctionID];

        // 判断当前拍卖是否结束
        require(
            !auction.ended &&
                auction.startTime + auction.duration > block.timestamp,
            "Auction has ended"
        );

        uint payValue;
        if (_tokenAddress != address(0)) {
            payValue =
                amount *
                uint(getChainlinkDataFeedLatestAnswer(_tokenAddress));
        } else {
            amount = msg.value;
            payValue =
                amount *
                uint(getChainlinkDataFeedLatestAnswer(address(0)));
        }

        uint startPriceValue = auction.startingPrice *
            uint(getChainlinkDataFeedLatestAnswer(auction.tokenAddress));
        uint highestBidValue = auction.highestBid *
            uint(getChainlinkDataFeedLatestAnswer(auction.tokenAddress));

        require(
            payValue >= startPriceValue && payValue > highestBidValue,
            "Bid must be higher than the current highest bid"
        );

        // 转移 ERC20 到合约
        if (_tokenAddress != address(0)) {
            IERC20(_tokenAddress).transferFrom(
                msg.sender,
                address(this),
                amount
            );
        }

        // 退还前最高价
        if (auction.highestBid > 0) {
            if (auction.tokenAddress == address(0)) {
                // 前一个出价用ETH：退还ETH
                payable(auction.highestBidder).transfer(auction.highestBid);
            } else {
                // 前一个出价用ERC20：退还ERC20
                IERC20(auction.tokenAddress).transfer(
                    auction.highestBidder,
                    auction.highestBid
                );
            }
        }

        auction.tokenAddress = _tokenAddress;
        auction.highestBidder = msg.sender;
        auction.highestBid = amount;
    }

    // 3. 结束拍卖
    function endAuction(uint256 _auctionID) public {
        Auction storage auction = auctions[_auctionID];

        // 判断当前拍卖是否结束
        require(
            !auction.ended &&
                (auction.startTime + auction.duration) <= block.timestamp,
            "Auction has not ended"
        );
        // 转移NFT到最高出价者
        IERC721(auction.nftContract).safeTransferFrom(
            address(this),
            auction.highestBidder,
            auction.tokenId
        );

        //payable(address(this)).transfer(address(this).balance);
        // 支付资金到卖家
        if (auction.tokenAddress == address(0)) {
            // 支付ETH
            payable(auction.seller).transfer(auction.highestBid);
        } else {
            // 支付ERC20
            IERC20(auction.tokenAddress).transfer(
                auction.seller,
                auction.highestBid
            );
        }
        auction.ended = true;
    }

    // 添加这个必需的函数
    function _authorizeUpgrade(address) internal view override {
        // 只有管理员可以升级合约
        require(msg.sender == admin, "Only admin can upgrade");
    }
}
