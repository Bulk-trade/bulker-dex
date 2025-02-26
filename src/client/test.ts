import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@project-serum/anchor';
import { BulkerDexClient, TokenType } from './index';
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress, 
  createMint 
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';

// Load the IDL
const idlPath = path.resolve(__dirname, '../../target/idl/bulker_dex.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

// Load the keypair
const keypairPath = path.resolve(process.env.HOME || '', '.config/solana/id.json');
const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(keypairPath, 'utf8')));
const keypair = Keypair.fromSecretKey(secretKey);

// Set up the connection
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new Wallet(keypair);

// Program ID - replace with your deployed program ID
const programId = new PublicKey('BuLKerDex1111111111111111111111111111111111');

// Magic Block authority - replace with the actual Magic Block authority
const magicBlockAuth = new PublicKey('MBLKhRxBCK7vLxaTpPDbzZsLTJqBhgUJ8bM6jE7ACS9');

// Pyth oracle account for SOL/USD - replace with the actual oracle account
const oraclePubkey = new PublicKey('7AxV2515SwLFVxWSpCngQ3TNqY17JERwcCfULc464u7D');

async function main() {
  // Create the client
  const client = new BulkerDexClient(connection, wallet, programId, idl);
  
  // Create token mints for testing
  console.log('Creating token mints...');
  const solMint = await createMint(connection, keypair);
  const usdcMint = await createMint(connection, keypair);
  
  // Create user token accounts
  console.log('Creating user token accounts...');
  const userSolAccount = await getAssociatedTokenAddress(
    solMint,
    keypair.publicKey,
    false // allowOwnerOffCurve
  );
  const userUsdcAccount = await getAssociatedTokenAddress(
    usdcMint,
    keypair.publicKey,
    false // allowOwnerOffCurve
  );
  
  // Initialize the pool
  console.log('Initializing pool...');
  const poolPda = await client.initializePool(
    1000000000, // 1 SOL (in lamports)
    100000000,  // 100 USDC (in micro-USDC)
    5,          // Concentration factor
    magicBlockAuth
  );
  console.log('Pool initialized:', poolPda.toString());
  
  // Create pool token accounts
  console.log('Creating pool token accounts...');
  const { poolSol, poolUsdc } = await client.createTokenAccounts(
    poolPda,
    solMint,
    usdcMint
  );
  
  // Get pool info
  console.log('Getting pool info...');
  const poolInfo = await client.getPoolInfo(keypair.publicKey);
  console.log('Pool info:', poolInfo);
  
  // Perform a swap
  console.log('Performing swap...');
  const txId = await client.swap(
    50000000,  // 0.05 SOL (in lamports)
    4500000,   // Minimum 4.5 USDC (in micro-USDC)
    TokenType.SOL,
    userSolAccount,
    userUsdcAccount,
    poolSol,
    poolUsdc,
    oraclePubkey
  );
  console.log('Swap transaction:', txId);
  
  // Get updated pool info
  console.log('Getting updated pool info...');
  const updatedPoolInfo = await client.getPoolInfo(keypair.publicKey);
  console.log('Updated pool info:', updatedPoolInfo);
}

// Helper function to create a token mint
async function createMint(connection: Connection, payer: Keypair): Promise<PublicKey> {
  return await createMint(
    connection,
    payer,
    payer.publicKey,
    null,
    9
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}); 