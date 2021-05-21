const {
  task,
  txTask,
  loadSignerSync,
  etherscanVerify,
} = require('../../helpers/tasks');
const { fetchAndParseYAML, getEthersProvider } = require('../../helpers/utils');
const {
  getCompiledContractFactory,
  getDeployedContractInstance,
  writeBulkDeploymentData,
  writeDeploymentData,
  deployContract,
  deployProxyAdminContract,
  deployProxyContract,
} = require('../../helpers/contracts');

const {
  deployAMPLContracts,
  deployXCAmpleContracts,
} = require('../../helpers/deploy');
const {
  AMPL_BASE_RATE,
  AMPL_BASE_CPI,
  execRebase,
  printRebaseInfo,
  toAmplFixedPt,
} = require('../../sdk/ampleforth');

//https://raw.githubusercontent.com/ampleforth/uFragments-eth-integration/master/migrations/deployments/mainnet-prod.yaml?token=ABPZMDSUSVNH45HUWCMM3R3AJDVOW
task(
  'deploy:use_deployed',
  'Generates deployment files for a deployed instance of Ampleforth',
)
  .addParam(
    'ampleforthDeploymentYaml',
    'The yaml file generated by the ampleforth deployment script',
  )
  .setAction(async (args, hre) => {
    const addresses = await fetchAndParseYAML(args.ampleforthDeploymentYaml);
    const UFragments = await getCompiledContractFactory(
      hre.ethers,
      'UFragments',
    );
    const UFragmentsPolicy = await getCompiledContractFactory(
      hre.ethers,
      'UFragmentsPolicy',
    );
    const Orchestrator = await getCompiledContractFactory(
      hre.ethers,
      'Orchestrator',
    );
    const MedianOracle = await getCompiledContractFactory(
      hre.ethers,
      'MedianOracle',
    );

    await writeBulkDeploymentData(hre.network.name, {
      isBaseChain: true,
      ampl: {
        address: addresses.UFragments,
        abi: UFragments.interface.format(),
      },
      policy: {
        address: addresses.UFragmentsPolicy,
        abi: UFragmentsPolicy.interface.format(),
      },
      orchestrator: {
        address: addresses.Orchestrator,
        abi: Orchestrator.interface.format(),
      },
      rateOracle: {
        address: addresses.RateOracle,
        abi: MedianOracle.interface.format(),
      },
      cpiOracle: {
        address: addresses.CpiOracle,
        abi: MedianOracle.interface.format(),
      },
    });
  });

txTask('testnet:deploy:ampleforth', 'Deploy ampleforth contract suite')
  .addParam(
    'fundingWallets',
    'List of wallets for initial funding',
    [],
    types.json,
  )
  .addParam('amount', 'Amount of ampl to transfer', 0, types.float)
  .setAction(async (args, hre) => {
    const txParams = { gasPrice: args.gasPrice, gasLimit: args.gasLimit };
    if(txParams.gasPrice == 0){
      txParams.gasPrice = await hre.ethers.provider.getGasPrice();
    }

    const deployer = loadSignerSync(args, hre.ethers.provider);
    const deployerAddress = await deployer.getAddress();

    console.log('------------------------------------------------------------');
    console.log('Deploying contracts on base-chain');
    console.log('Deployer:', deployerAddress);

    const {
      proxyAdmin,
      ampl,
      policy,
      orchestrator,
      rateOracle,
      cpiOracle,
    } = await deployAMPLContracts(hre.ethers, deployer, txParams);
    for (const w in args.fundingWallets) {
      await ampl.transfer(args.fundingWallets[w], toAmplFixedPt(args.amount));
    }

    console.log('------------------------------------------------------------');
    await execRebase(0, rateOracle, orchestrator, policy, deployer, txParams);

    console.log('------------------------------------------------------------');
    console.log('Writing data to file');
    await writeDeploymentData(hre.network.name, 'proxyAdmin', proxyAdmin);
    await writeDeploymentData(hre.network.name, 'ampl', ampl);
    await writeDeploymentData(hre.network.name, 'policy', policy);
    await writeDeploymentData(hre.network.name, 'orchestrator', orchestrator);
    await writeDeploymentData(hre.network.name, 'rateOracle', rateOracle);
    await writeDeploymentData(hre.network.name, 'cpiOracle', cpiOracle);
    await writeBulkDeploymentData(hre.network.name, {
      isBaseChain: true,
    });

    console.log('------------------------------------------------------------');
    console.log('Verify on etherscan');
    await etherscanVerify(hre, proxyAdmin.address);
    await etherscanVerify(
      hre,
      await proxyAdmin.getProxyImplementation(ampl.address),
    );
    await etherscanVerify(
      hre,
      await proxyAdmin.getProxyImplementation(policy.address),
    );
    await etherscanVerify(hre, orchestrator.address, [policy.address]);
    await etherscanVerify(hre, rateOracle.address, [3600 * 24 * 365, 0, 1]);
    await etherscanVerify(hre, cpiOracle.address, [3600 * 24 * 365, 0, 1]);
  });

txTask('deploy:ampleforth_xc', 'Deploy cross chain ampleforth contract suite')
  .addParam('baseChainNetwork', 'The hardhat network name of the base chain')
  .addParam(
    'tokenSymbol',
    'The full name of the cross-chain ample ERC-20 token',
  )
  .addParam('tokenName', 'The symbol of the cross-chain ample ERC-20 token')
  .setAction(async (args, hre) => {
    const txParams = { gasPrice: args.gasPrice, gasLimit: args.gasLimit };
    if(txParams.gasPrice == 0){
      txParams.gasPrice = await hre.ethers.provider.getGasPrice();
    }

    const deployer = await loadSignerSync(args, hre.ethers.provider);
    const deployerAddress = await deployer.getAddress();

    console.log('------------------------------------------------------------');
    console.log('Deployer:', deployerAddress);
    console.log(txParams);

    console.log('------------------------------------------------------------');
    console.log('Reading base-chain parameters');
    const baseChainProvider = getEthersProvider(args.baseChainNetwork);
    const baseChainPolicy = await getDeployedContractInstance(
      args.baseChainNetwork,
      'policy',
      baseChainProvider,
    );
    await printRebaseInfo(baseChainPolicy);
    const [
      globalAmpleforthEpoch,
      globalAMPLSupply,
    ] = await baseChainPolicy.globalAmpleforthEpochAndAMPLSupply();

    console.log('------------------------------------------------------------');
    console.log('Deploying Contracts on satellite-chain');
    const {
      proxyAdmin,
      xcAmple,
      xcAmpleController,
      rebaseRelayer,
    } = await deployXCAmpleContracts(
      { ...args, globalAmpleforthEpoch, globalAMPLSupply },
      hre.ethers,
      deployer,
      txParams,
    );

    console.log('------------------------------------------------------------');
    console.log('Writing data to file');
    await writeDeploymentData(hre.network.name, 'proxyAdmin', proxyAdmin);
    await writeDeploymentData(hre.network.name, 'xcAmple', xcAmple);
    await writeDeploymentData(
      hre.network.name,
      'xcAmpleController',
      xcAmpleController,
    );
    await writeDeploymentData(hre.network.name, 'rebaseRelayer', rebaseRelayer);
    await writeBulkDeploymentData(hre.network.name, {
      isBaseChain: false,
    });

    console.log('------------------------------------------------------------');
    console.log('Verify on etherscan');
    await etherscanVerify(hre, proxyAdmin.address);
    await etherscanVerify(hre, rebaseRelayer.address);
    await etherscanVerify(
      hre,
      await proxyAdmin.getProxyImplementation(xcAmple.address),
    );
    await etherscanVerify(
      hre,
      await proxyAdmin.getProxyImplementation(xcAmpleController.address),
    );
  });
