import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC);
const mockUSDC = '0x066FB28a2833915464A38C5CE5645DF467b5094b';
const battleFactory = '0x33D44920939279370c2b83771c3b6A8f99C6487a';

const bullWallet = new ethers.Wallet(process.env.BULL_AGENT_PRIVATE_KEY, provider);
const bearWallet = new ethers.Wallet(process.env.BEAR_AGENT_PRIVATE_KEY, provider);

const usdcAbi = ['function approve(address spender, uint256 amount) external returns (bool)'];

async function approveAll() {
  const usdc = new ethers.Contract(mockUSDC, usdcAbi, provider);
  
  console.log('📝 Approving USDC for Bull agent...');
  const bullTx = await usdc.connect(bullWallet).approve(battleFactory, ethers.MaxUint256);
  await bullTx.wait();
  console.log('✅ Bull approved');
  
  console.log('📝 Approving USDC for Bear agent...');
  const bearTx = await usdc.connect(bearWallet).approve(battleFactory, ethers.MaxUint256);
  await bearTx.wait();
  console.log('✅ Bear approved');
}

approveAll().catch(console.error);
