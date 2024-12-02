import { expect } from "chai";
import hre from "hardhat";

const { ethers } = hre;

describe("Marketplace", function () {
  let marketplace;
  let royaltyNFT;
  let owner;
  let seller;
  let buyer;
  let recipient1;
  let recipient2;

  beforeEach(async function () {
    [owner, seller, buyer, recipient1, recipient2] = await ethers.getSigners();
    const RoyaltyNFT = await ethers.getContractFactory("RoyaltyManagedNFT");
    royaltyNFT = await RoyaltyNFT.deploy();
    await royaltyNFT.waitForDeployment();
    const DEFAULT_ADMIN_ROLE = await royaltyNFT.DEFAULT_ADMIN_ROLE();
    const ROYALTY_MANAGER_ROLE = await royaltyNFT.ROYALTY_MANAGER_ROLE();
    await royaltyNFT.grantRole(DEFAULT_ADMIN_ROLE, await owner.getAddress());
    const Marketplace = await ethers.getContractFactory("Marketplace");
    marketplace = await Marketplace.deploy();
    await marketplace.waitForDeployment();
    const marketplaceAddress = await marketplace.getAddress();
    await royaltyNFT.grantRole(ROYALTY_MANAGER_ROLE, marketplaceAddress);
  });
  async function mintAndApproveNFT(to, tokenId) {
    await royaltyNFT.connect(owner).mintToken(
      await to.getAddress(),
      `https://example.com/token/${tokenId}`,
      [await recipient1.getAddress(), await recipient2.getAddress()],
      [5000, 5000] 
    );
    await royaltyNFT.connect(to).approve(marketplace.target, tokenId);
    console.log(`Minting to: ${await to.getAddress()}`);
    console.log(`Recipient 1: ${await recipient1.getAddress()}`);
    console.log(`Recipient 2: ${await recipient2.getAddress()}`);
    console.log(`Marketplace target: ${marketplace.target}`);

  }

  describe("Creating a listing", function () {
    it("Should create a listing successfully", async function () {
      await mintAndApproveNFT(seller, 1);

      await expect(
        marketplace
          .connect(seller)
          .createListing(royaltyNFT.target, 1, ethers.parseEther("1"), true)
      )
        .to.emit(marketplace, "ListingCreated")
        .withArgs(
          1,
          await seller.getAddress(),
          ethers.parseEther("1"),
        );

      const listing = await marketplace.getListing(1);
      expect(listing.tokenAddress).to.equal(royaltyNFT.target);
      expect(listing.tokenId).to.equal(1);
      expect(listing.listingPrice).to.equal(ethers.parseEther("1"));
      expect(listing.seller).to.equal(await seller.getAddress());
      expect(listing.fullOwnershipAvailable).to.be.true;
      expect(listing.sold).to.be.false;
    });

    it("Should revert if the seller doesn't own the token", async function () {
      await mintAndApproveNFT(buyer, 1);

      await expect(
        marketplace
          .connect(seller)
          .createListing(royaltyNFT.target, 1, ethers.parseEther("1"), true)
      ).to.be.revertedWith("You don't own this token");
    });

    it("Should revert if the contract is not approved", async function () {
      await royaltyNFT.connect(owner).mintToken(
        await seller.getAddress(),
        "https://example.com/token/1",
        [await recipient1.getAddress(), await recipient2.getAddress()],
        [5000, 5000]
      );

      await expect(
        marketplace
          .connect(seller)
          .createListing(royaltyNFT.target, 1, ethers.parseEther("1"), true)
      ).to.be.revertedWith("Contract not approved");
    });

    it("Should revert minting with invalid royalty percentages", async function () {
      await expect(
        royaltyNFT.connect(owner).mintToken(
          await seller.getAddress(),
          "https://example.com/token/1",
          [await recipient1.getAddress(), await recipient2.getAddress()],
          [6000, 5000] 
        )
      ).to.be.revertedWith("Total royalty exceeds 100%");
    });
  });

  describe("Buying from a listing", function () {
    beforeEach(async function () {
      await mintAndApproveNFT(seller, 1);
      await marketplace
        .connect(seller)
        .createListing(royaltyNFT.target, 1, ethers.parseEther("1"), true);
    });
    it("Should allow buying from a listing", async function () {
      const initialSellerBalance = await ethers.provider.getBalance(seller.address);
      console.log(initialSellerBalance)
      const initialRecipient1Balance = await ethers.provider.getBalance(recipient1.address);
      console.log(initialRecipient1Balance)
      const initialRecipient2Balance = await ethers.provider.getBalance(recipient2.address);
      console.log(initialRecipient2Balance)

      await marketplace.connect(buyer).buyFromListing(1, { value: ethers.parseEther("1") });
      console.log(await buyer.getAddress())
      const finalSellerBalance = await ethers.provider.getBalance(seller.address);
      console.log(finalSellerBalance)
      const finalRecipient1Balance = await ethers.provider.getBalance(recipient1.address);
      console.log(finalRecipient1Balance)
      const finalRecipient2Balance = await ethers.provider.getBalance(recipient2.address);
      console.log(finalRecipient2Balance)

      expect(finalSellerBalance - initialSellerBalance).to.equal(ethers.parseEther("0"));
      expect(finalRecipient1Balance - initialRecipient1Balance).to.equal(ethers.parseEther("0.5"));
      expect(finalRecipient2Balance - initialRecipient2Balance).to.equal(ethers.parseEther("0.5"));
    });

    it("Should revert if the listing is already sold", async function () {
      await marketplace.connect(buyer).buyFromListing(1, { value: ethers.parseEther("1") });
      
      await expect(
        marketplace.connect(buyer).buyFromListing(1, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("Already sold");
    });

    it("Should revert if insufficient payment is sent", async function () {
      await expect(
        marketplace.connect(buyer).buyFromListing(1, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("Insufficient payment");
    });
  });

  describe("Buying full ownership", function () {
    beforeEach(async function () {
      await mintAndApproveNFT(seller, 1);
      const marketplaceAddress = await marketplace.getAddress();
      await marketplace
        .connect(seller)
        .createListing(royaltyNFT.target, 1, ethers.parseEther("1"), true);
    });

    it("Should allow buying full ownership", async function () {
      await expect(
        marketplace.connect(buyer).buyFullOwnership(1, {
          value: ethers.parseEther("1"),
        })
      )
        .to.emit(marketplace, "ListingBought")
        .withArgs(1, await buyer.getAddress(), ethers.parseEther("1"), true);

      expect(await royaltyNFT.ownerOf(1)).to.equal(await buyer.getAddress());
    });

    it("Should revert if full ownership is not available", async function () {
      await mintAndApproveNFT(seller, 2);
      await marketplace
        .connect(seller)
        .createListing(royaltyNFT.target, 2, ethers.parseEther("1"), false);

      await expect(
        marketplace.connect(buyer).buyFullOwnership(2, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWith("Full ownership not available");
    });
  });
});
