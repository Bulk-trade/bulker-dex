import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Wallet } from '@project-serum/anchor';
import { BulkerDexClient, TokenType } from './index';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import * as borsh from 'borsh';

// Load the IDL
const idlPath = path.resolve(__dirname, '../../target/idl/bulker_dex.json');
const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

// Load the Magic Block keypair (this would be the Magic Block authority)
const magicBlockKeypairPath = path.resolve(__dirname, './magic-block-keypair.json');
const magicBlockSecretKey = Uint8Array.from(JSON.parse(fs.readFileSync(magicBlockKeypairPath, 'utf8')));
const magicBlockKeypair = Keypair.fromSecretKey(magicBlockSecretKey);

// Set up the connection
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new Wallet(magicBlockKeypair);

// Program ID - replace with your deployed program ID
const programId = new PublicKey('BuLKerDex1111111111111111111111111111111111');

// Pyth oracle account for SOL/USD - replace with the actual oracle account
const oraclePubkey = new PublicKey('7AxV2515SwLFVxWSpCngQ3TNqY17JERwcCfULc464u7D');

// Define the schema for serializing/deserializing the delegated swap data
class DelegatedSwap {
  inputToken: number;
  amountIn: bigint;
  minAmountOut: bigint;

  constructor(props: { inputToken: number; amountIn: bigint; minAmountOut: bigint }) {
    this.inputToken = props.inputToken;
    this.amountIn = props.amountIn;
    this.minAmountOut = props.minAmountOut;
  }
}

const DelegatedSwapSchema = new Map([
  [
    DelegatedSwap,
    {
      kind: 'struct',
      fields: [
        ['inputToken', 'u8'],
        ['amountIn', 'u64'],
        ['minAmountOut', 'u64'],
      ],
    },
  ],
]);

async function main() {
  // Create the client
  const client = new BulkerDexClient(connection, wallet, programId, idl);
  
  // User's public key (the user who initiated the swap)
  const userPubkey = new PublicKey('USER_PUBLIC_KEY_HERE');
  
  // Token accounts
  const solMint = new PublicKey('SOL_MINT_HERE');
  const usdcMint = new PublicKey('USDC_MINT_HERE');
  
  const userSolAccount = await getAssociatedTokenAddress(
    solMint,
    userPubkey,
    false
  );
  
  const userUsdcAccount = await getAssociatedTokenAddress(
    usdcMint,
    userPubkey,
    false
  );
  
  // Find the pool PDA
  const [poolPda, _] = await client.findPoolAddress(userPubkey);
  
  // Get pool token accounts
  const { poolSol, poolUsdc } = await client.createTokenAccounts(
    poolPda,
    solMint,
    usdcMint
  );
  
  // Create the delegated swap data
  const delegatedSwap = new DelegatedSwap({
    inputToken: TokenType.SOL,
    amountIn: BigInt(50000000),  // 0.05 SOL
    minAmountOut: BigInt(4500000), // 4.5 USDC
  });
  
  // Serialize the data
  const buffer = Buffer.alloc(1000);
  const length = borsh.serialize(DelegatedSwapSchema, delegatedSwap, buffer);
  const data = buffer.slice(0, length);
  
  console.log('Processing delegated swap as Magic Block...');
  const txId = await client.processDelegatedSwap(
    data,
    magicBlockKeypair.publicKey,
    userPubkey,
    userSolAccount,
    userUsdcAccount,
    poolSol,
    poolUsdc,
    oraclePubkey
  );
  
  console.log('Delegated swap processed:', txId);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
}); 