// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./RoyaltyNFT.sol";

interface IRoyaltyManagedNFT {
    function getRoyaltyDetails(uint256 tokenId) external view returns (address[] memory, uint256[] memory);
    function removeRecipients(uint256 tokenId, address[] calldata recipients) external;
    function grantRole(bytes32 role, address account) external;
    function ROYALTY_MANAGER_ROLE() external view returns (bytes32);
}

contract Marketplace is ERC721Holder, ReentrancyGuard {
    struct Listing {
        address tokenAddress;
        uint256 tokenId;
        uint256 listingPrice;
        address seller;
        bool fullOwnershipAvailable;
        bool sold;
    }

    mapping(uint256 => Listing) private listings;
    mapping(bytes32 => bool) private isTokenListed;
    uint256 public nextListingId = 1;

    event ListingCreated(uint256 indexed listingId, address indexed seller, uint256 price);
    event ListingDeleted(uint256 indexed listingId);
    event ListingBought(uint256 indexed listingId, address indexed buyer, uint256 price, bool fullOwnership);

    function createListing(
        address _tokenAddress,
        uint256 _tokenId,
        uint256 _listingPrice,
        bool _fullOwnershipAvailable
    ) external returns (uint256) {
        require(IERC721(_tokenAddress).ownerOf(_tokenId) == msg.sender, "You don't own this token");
        require(IERC721(_tokenAddress).getApproved(_tokenId) == address(this), "Contract not approved");
        bytes32 listingKey = keccak256(abi.encodePacked(_tokenAddress, _tokenId));
        require(!isTokenListed[listingKey], "Token is already listed");

        listings[nextListingId] = Listing({
            tokenAddress: _tokenAddress,
            tokenId: _tokenId,
            listingPrice: _listingPrice,
            seller: msg.sender,
            fullOwnershipAvailable: _fullOwnershipAvailable,
            sold: false
        });

        // Remove the grantRole call from here

        isTokenListed[listingKey] = true;
        IERC721(_tokenAddress).safeTransferFrom(msg.sender, address(this), _tokenId);

        emit ListingCreated(nextListingId, msg.sender, _listingPrice);
        return nextListingId++;
    }

    function buyFromListing(uint256 _listingId) external payable nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.listingPrice > 0, "Listing does not exist");
        require(!listing.sold, "Already sold");
        require(msg.value >= listing.listingPrice, "Insufficient payment");
        listing.sold = true;
        bytes32 listingKey = keccak256(abi.encodePacked(listing.tokenAddress, listing.tokenId));
        isTokenListed[listingKey] = false;
        uint256 royaltyAmount = _distributeRoyalties(listing.tokenAddress, listing.tokenId, listing.listingPrice);
        uint256 sellerAmount = listing.listingPrice - royaltyAmount;
        (bool success,) = listing.seller.call{value:msg.value - sellerAmount}("");
        require(success,"Failed to send money");
        if (msg.value > listing.listingPrice) {
            (bool sent,) = msg.sender.call{value:msg.value - listing.listingPrice}("");
            require(sent,"Failed to send money");
        }
        IERC721(listing.tokenAddress).safeTransferFrom(address(this), msg.sender, listing.tokenId);
        emit ListingBought(_listingId, msg.sender, listing.listingPrice, false);
    }

    function buyFullOwnership(uint256 _listingId) external payable nonReentrant {
        Listing storage listing = listings[_listingId];
        require(listing.fullOwnershipAvailable, "Full ownership not available");
        require(!listing.sold, "Already sold");
        require(msg.value >= listing.listingPrice, "Insufficient funds");
        listing.sold = true;
        bytes32 listingKey = keccak256(abi.encodePacked(listing.tokenAddress, listing.tokenId));
        isTokenListed[listingKey] = false;
        uint256 listingPrice = listing.listingPrice;
        IRoyaltyManagedNFT nftContract = IRoyaltyManagedNFT(listing.tokenAddress);
        (address[] memory recipients, uint256[] memory percentages) = nftContract.getRoyaltyDetails(listing.tokenId);
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 royaltyAmount = (listingPrice * percentages[i]) / 10000; 
            (bool sent,) = recipients[i].call{value:royaltyAmount}("");
            require(sent,"Failed to send money");
            listingPrice -= royaltyAmount;
        }
        (bool success,) = listing.seller.call{value:listingPrice}("");
        require(success,"Failed to send money");
        //nftContract.grantRole(nftContract.ROYALTY_MANAGER_ROLE(), msg.sender);
        nftContract.removeRecipients(listing.tokenId, recipients);
        IERC721(listing.tokenAddress).safeTransferFrom(address(this), msg.sender, listing.tokenId);
        emit ListingBought(_listingId, msg.sender, listing.listingPrice, true);
    }

    function _distributeRoyalties(
        address tokenAddress,
        uint256 tokenId,
        uint256 salePrice
    ) internal returns (uint256 totalRoyalty) {
        IRoyaltyManagedNFT nftContract = IRoyaltyManagedNFT(tokenAddress);
        (address[] memory recipients, uint256[] memory percentages) = nftContract.getRoyaltyDetails(tokenId);

        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 amount = (salePrice * percentages[i]) / 10000; 
            payable(recipients[i]).transfer(amount);
        }
    }
    function getListing(uint256 _ListingId) external view returns(Listing memory){
        require(_ListingId <= nextListingId, "Invalid listing id");
        return listings[_ListingId];
    }
}
