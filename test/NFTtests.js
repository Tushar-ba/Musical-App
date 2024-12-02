const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RoyaltyManagedNFT", function () {
  let RoyaltyManagedNFT;
  let royaltyNFT;
  let owner;
  let minter;
  let recipient1;
  let recipient2;
  let recipient3;
  let newManager;

  beforeEach(async function () {
    [owner, minter, recipient1, recipient2, recipient3, newManager] = await ethers.getSigners();

    RoyaltyManagedNFT = await ethers.getContractFactory("RoyaltyManagedNFT");
    royaltyNFT = await RoyaltyManagedNFT.deploy();
    await royaltyNFT.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the correct name and symbol", async function () {
      expect(await royaltyNFT.name()).to.equal("RoyaltyManagedNFT");
      expect(await royaltyNFT.symbol()).to.equal("RMNFT");
    });

    it("Should grant DEFAULT_ADMIN_ROLE to the deployer", async function () {
      const DEFAULT_ADMIN_ROLE = await royaltyNFT.DEFAULT_ADMIN_ROLE();
      expect(await royaltyNFT.hasRole(DEFAULT_ADMIN_ROLE, owner.address)).to.be.true;
    });
  });

  describe("Minting", function () {
    it("Should mint a token with correct royalty information", async function () {
      const tokenURI = "https://example.com/token/1";
      const recipients = [recipient1.address, recipient2.address];
      const percentages = [60, 40];

      const tx = await royaltyNFT.connect(owner).mintToken(
        minter.address,
        tokenURI,
        recipients,
        percentages
      );
      const receipt = await tx.wait();

      const mintEvent = receipt.logs.find(log => log.fragment.name === 'Transfer');
      const tokenId = mintEvent.args[2];

      expect(await royaltyNFT.ownerOf(tokenId)).to.equal(minter.address);
      expect(await royaltyNFT.tokenURI(tokenId)).to.equal(tokenURI);

      const [storedRecipients, storedPercentages] = await royaltyNFT.getRoyaltyDetails(tokenId);
      expect(storedRecipients).to.deep.equal(recipients);
      expect(storedPercentages.map(p => Number(p))).to.deep.equal(percentages);

      const ROYALTY_MANAGER_ROLE = await royaltyNFT.ROYALTY_MANAGER_ROLE();
      expect(await royaltyNFT.hasRole(ROYALTY_MANAGER_ROLE, minter.address)).to.be.true;
    });

    it("Should revert minting with invalid royalty percentages", async function () {
      const tokenURI = "https://example.com/token/1";
      const recipients = [recipient1.address, recipient2.address];
      const percentages = [6000, 5000]; // Total exceeds 100%

      await expect(
        royaltyNFT.connect(owner).mintToken(
          minter.address,
          tokenURI,
          recipients,
          percentages
        )
      ).to.be.revertedWith("Total royalty exceeds 100%");
    });

    it("Should revert minting from non-admin", async function () {
      const tokenURI = "https://example.com/token/1";
      const recipients = [recipient1.address, recipient2.address];
      const percentages = [60, 40];

      await expect(
        royaltyNFT.connect(minter).mintToken(
          minter.address,
          tokenURI,
          recipients,
          percentages
        )
      ).to.be.revertedWithCustomError(royaltyNFT, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Recipient Management", function () {
    let tokenId;

    beforeEach(async function () {
      const tokenURI = "https://example.com/token/1";
      const initialRecipients = [recipient1.address];
      const initialPercentages = [100];

      const tx = await royaltyNFT.connect(owner).mintToken(
        minter.address,
        tokenURI,
        initialRecipients,
        initialPercentages
      );
      const receipt = await tx.wait();
      const mintEvent = receipt.logs.find(log => log.fragment.name === 'Transfer');
      tokenId = mintEvent.args[2];
    });

    it("Should add new recipients by royalty manager", async function () {
      const newRecipients = [recipient2.address, recipient3.address];
      const newPercentages = [30, 20];

      await royaltyNFT.connect(minter).addRecipients(tokenId, newRecipients, newPercentages);

      const [storedRecipients, storedPercentages] = await royaltyNFT.getRoyaltyDetails(tokenId);

      expect(storedRecipients.length).to.equal(3);
      expect(storedPercentages.length).to.equal(3);
      expect(storedRecipients).to.include(recipient2.address);
      expect(storedRecipients).to.include(recipient3.address);
    });

    it("Should remove recipients by royalty manager", async function () {
      const newRecipients = [recipient2.address, recipient3.address];
      const newPercentages = [30, 20];
      await royaltyNFT.connect(minter).addRecipients(tokenId, newRecipients, newPercentages);

      await royaltyNFT.connect(minter).removeRecipients(tokenId, [recipient2.address]);

      const [storedRecipients, storedPercentages] = await royaltyNFT.getRoyaltyDetails(tokenId);

      expect(storedRecipients.length).to.equal(2);
      expect(storedRecipients).to.not.include(recipient2.address);
    });

    it("Should revert adding recipients if total percentage exceeds 100%", async function () {
      const newRecipients = [recipient2.address, recipient3.address];
      const newPercentages = [5000, 6000]; // Total would exceed 100%

      await expect(
        royaltyNFT.connect(minter).addRecipients(tokenId, newRecipients, newPercentages)
      ).to.be.revertedWith("Total royalty exceeds 100%");
    });

    it("Should revert managing recipients by non-royalty manager", async function () {
      const newRecipients = [recipient2.address];
      const newPercentages = [30];

      await expect(
        royaltyNFT.connect(owner).addRecipients(tokenId, newRecipients, newPercentages)
      ).to.be.revertedWithCustomError(royaltyNFT, "AccessControlUnauthorizedAccount");

      await expect(
        royaltyNFT.connect(owner).removeRecipients(tokenId, [recipient1.address])
      ).to.be.revertedWithCustomError(royaltyNFT, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Royalty Manager Transfer", function () {
    let tokenId;

    beforeEach(async function () {
      const tokenURI = "https://example.com/token/1";
      const recipients = [recipient1.address];
      const percentages = [100];

      const tx = await royaltyNFT.connect(owner).mintToken(
        minter.address,
        tokenURI,
        recipients,
        percentages
      );
      const receipt = await tx.wait();
      const mintEvent = receipt.logs.find(log => log.fragment.name === 'Transfer');
      tokenId = mintEvent.args[2];
    });

    it("Should transfer royalty manager role", async function () {
      const ROYALTY_MANAGER_ROLE = await royaltyNFT.ROYALTY_MANAGER_ROLE();
      await royaltyNFT.connect(owner).grantRole(ROYALTY_MANAGER_ROLE, minter.address);
      expect(await royaltyNFT.hasRole(ROYALTY_MANAGER_ROLE, minter.address)).to.be.true;
      await royaltyNFT.connect(minter).transferRoyaltyManager(tokenId, newManager.address);
      expect(await royaltyNFT.hasRole(ROYALTY_MANAGER_ROLE, minter.address)).to.be.false;
      expect(await royaltyNFT.hasRole(ROYALTY_MANAGER_ROLE, newManager.address)).to.be.true;
    });

    it("Should revert royalty manager transfer by non-manager", async function () {
      await expect(
        royaltyNFT.connect(owner).transferRoyaltyManager(tokenId, newManager.address)
      ).to.be.revertedWithCustomError(royaltyNFT, "AccessControlUnauthorizedAccount");
    });
  });
});

console.log("All tests completed successfully!");

