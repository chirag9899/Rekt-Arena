import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC);
const mockUSDC = '0xDCCFe16Fe7e804a211D0821D45936F08A7ED24A8';
const battleFactory = '0xdD8c61DA78F5b7aD187a228D9D0395318aFb2834';

const bullWallet = new ethers.Wallet(process.env.BULL_AGENT_PRIVATE_KEY, provider);
const bearWallet = new ethers.Wallet(process.env.BEAR_AGENT_PRIVATE_KEY, provider);

const usdcAbi = ['function approve(address spender, uint256 amount) external returns (bool)'];

async function approveAll() {
  const usdc = new ethers.Contract(mockUSDC, usdcAbi, provider);
  
  console.log('📝 Approving USDC for Bull agent...');
  const bullTx = await usdc.connect(bullWallet).approve(battleFactory, ethers.MaxUint256);
  console.log('⏳ Waiting for Bull approval...');
  await bullTx.wait();
  console.log('✅ Bull approved:', bullTx.hash);
  
  console.log('📝 Approving USDC for Bear agent...');
  const bearTx = await usdc.connect(bearWallet).approve(battleFactory, ethers.MaxUint256);
  console.log('⏳ Waiting for Bear approval...');
  await bearTx.wait();
  console.log('✅ Bear approved:', bearTx.hash);
  
  console.log('🎉 All approvals done!');
}

approveAll().catch(console.error);
