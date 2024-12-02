// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract RoyaltyManagedNFT is ERC721URIStorage, AccessControl{
     bytes32 public constant ROYALTY_MANAGER_ROLE = keccak256("ROYALTY_MANAGER_ROLE");
    struct RoyaltyInfo{
        address[] recipients;
        uint256[] percentages;
        uint256 totalPercentage;
    }
    mapping (uint256 => RoyaltyInfo) private _royalties;
    uint256 private _tokenIdCounter;
    event RoyaltyAssigned(uint256 indexed tokenId, address[] recipients, uint256[] percentages);
    event RoyaltyUpdated(uint256 indexed tokenId, address[] recipients, uint256[] percentages);
    event RoyaltyManagerTransferred(uint256 indexed tokenId, address indexed newManager);

    constructor() ERC721("RoyaltyManagedNFT", "RMNFT") {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);  
    }

    function mintToken(address to, string memory tokenURI, address[] memory recipients, uint256[] memory percentages) external  returns (uint256){
    require(recipients.length == percentages.length, "Mismatched arrays");
        uint256 totalPercentage;
        for (uint256 i = 0; i < percentages.length; i++) {
            totalPercentage += percentages[i];
        }
        require(totalPercentage <= 10000, "Total royalty exceeds 100%");
        uint256 tokenId = _tokenIdCounter + 1;
        _tokenIdCounter = tokenId;  
        _mint(to, tokenId);
        _setTokenURI(tokenId, tokenURI);
        _royalties[tokenId] = RoyaltyInfo({
            recipients: recipients,
            percentages: percentages,
            totalPercentage: totalPercentage
        });
        grantRole(ROYALTY_MANAGER_ROLE, to);  
        emit RoyaltyAssigned(tokenId, recipients, percentages);
        return tokenId;
    }

    function addRecipients(
        uint256 tokenId,
        address[] memory newRecipients,
        uint256[] memory newPercentages
    ) external onlyRole(ROYALTY_MANAGER_ROLE) {
        require(newRecipients.length == newPercentages.length, "Mismatched arrays");

        RoyaltyInfo storage royalty = _royalties[tokenId];
        uint256 totalPercentage = royalty.totalPercentage;

        for (uint256 i = 0; i < newRecipients.length; i++) {
            royalty.recipients.push(newRecipients[i]);
            royalty.percentages.push(newPercentages[i]);
            totalPercentage += newPercentages[i];
        }

        require(totalPercentage <= 10000, "Total royalty exceeds 100%");
        royalty.totalPercentage = totalPercentage;

        emit RoyaltyUpdated(tokenId, royalty.recipients, royalty.percentages);
    }

    function removeRecipients(uint256 tokenId, address[] memory recipientsToRemove) external onlyRole(ROYALTY_MANAGER_ROLE) {
    RoyaltyInfo storage royalty = _royalties[tokenId];
    for (uint256 i = 0; i < recipientsToRemove.length; i++) {
        for (uint256 j = 0; j < royalty.recipients.length; j++) {
            if (royalty.recipients[j] == recipientsToRemove[i]) {
                royalty.totalPercentage -= royalty.percentages[j];
                royalty.recipients[j] = royalty.recipients[royalty.recipients.length - 1];
                royalty.percentages[j] = royalty.percentages[royalty.percentages.length - 1];
                royalty.recipients.pop();
                royalty.percentages.pop();
                break;
            }
        }
    }
    emit RoyaltyUpdated(tokenId, royalty.recipients, royalty.percentages);
}



    function transferRoyaltyManager(uint256 tokenId, address newManager) external onlyRole(ROYALTY_MANAGER_ROLE) {
        _revokeRole(ROYALTY_MANAGER_ROLE, _msgSender());
        _grantRole(ROYALTY_MANAGER_ROLE, newManager);
        emit RoyaltyManagerTransferred(tokenId, newManager);
    }

    function getRoyaltyDetails(uint256 tokenId) external view returns (address[] memory, uint256[] memory) {
        RoyaltyInfo storage royalty = _royalties[tokenId];
        return (royalty.recipients, royalty.percentages);
    }
    
   function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
