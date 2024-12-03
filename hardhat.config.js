require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
      version: '0.8.27',
      settings: {
          optimizer: {
              enabled: true,
              runs: 200,
          },
      },
  },
  networks: {
      mumbai: {
          url: "https://rpc-amoy.polygon.technology/",
          accounts: ["your private key"],
          chainId: 80002,
      },
  },
  etherscan: {
      apiKey: {
            polygonAmoy:"your Polygon API key"
      },
    },
};
