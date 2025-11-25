// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MockNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("MockNFT", "MNFT") Ownable(msg.sender) {
        _nextTokenId = 1;
    }

    function mint(address to, uint256 tokenId) public {
        _mint(to, tokenId);
    }

    function safeMint(address to) public returns (uint256) {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;
        _safeMint(to, tokenId);
        return tokenId;
    }

    function getNextTokenId() public view returns (uint256) {
        return _nextTokenId;
    }
}
