"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@project-serum/anchor");
const index_1 = require("./index");
const spl_token_1 = require("@solana/spl-token");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Load the IDL
const idlPath = path_1.default.resolve(__dirname, '../../target/idl/bulker_dex.json');
const idl = JSON.parse(fs_1.default.readFileSync(idlPath, 'utf8'));
// Load the keypair
const keypairPath = path_1.default.resolve(process.env.HOME, '.config/solana/id.json');
const secretKey = Uint8Array.from(JSON.parse(fs_1.default.readFileSync(keypairPath, 'utf8')));
const keypair = web3_js_1.Keypair.fromSecretKey(secretKey);
// Set up the connection
const connection = new web3_js_1.Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new anchor_1.Wallet(keypair);
// Program ID - replace with your deployed program ID
const programId = new web3_js_1.PublicKey('BuLKerDex1111111111111111111111111111111111');
// Magic Block authority - replace with the actual Magic Block authority
const magicBlockAuth = new web3_js_1.PublicKey('MBLKhRxBCK7vLxaTpPDbzZsLTJqBhgUJ8bM6jE7ACS9');
// Pyth oracle account for SOL/USD - replace with the actual oracle account
const oraclePubkey = new web3_js_1.PublicKey('7AxV2515SwLFVxWSpCngQ3TNqY17JERwcCfULc464u7D');
async function main() {
    // Create the client
    const client = new index_1.BulkerDexClient(connection, wallet, programId, idl);
    // Create token mints for testing
    console.log('Creating token mints...');
    const solMint = await createMint(connection, keypair);
    const usdcMint = await createMint(connection, keypair);
    // Create user token accounts
    console.log('Creating user token accounts...');
    const userSolAccount = await spl_token_1.Token.getAssociatedTokenAddress(solMint, keypair.publicKey, false);
    const userUsdcAccount = await spl_token_1.Token.getAssociatedTokenAddress(usdcMint, keypair.publicKey, false);
    // Initialize the pool
    console.log('Initializing pool...');
    const poolPda = await client.initializePool(1000000000, // 1 SOL (in lamports)
    100000000, // 100 USDC (in micro-USDC)
    5, // Concentration factor
    magicBlockAuth);
    console.log('Pool initialized:', poolPda.toString());
    // Create pool token accounts
    console.log('Creating pool token accounts...');
    const { poolSol, poolUsdc } = await client.createTokenAccounts(poolPda, solMint, usdcMint);
    // Get pool info
    console.log('Getting pool info...');
    const poolInfo = await client.getPoolInfo(keypair.publicKey);
    console.log('Pool info:', poolInfo);
    // Perform a swap
    console.log('Performing swap...');
    const txId = await client.swap(50000000, // 0.05 SOL (in lamports)
    4500000, // Minimum 4.5 USDC (in micro-USDC)
    index_1.TokenType.SOL, userSolAccount, userUsdcAccount, poolSol, poolUsdc, oraclePubkey);
    console.log('Swap transaction:', txId);
    // Get updated pool info
    console.log('Getting updated pool info...');
    const updatedPoolInfo = await client.getPoolInfo(keypair.publicKey);
    console.log('Updated pool info:', updatedPoolInfo);
}
// Helper function to create a token mint
async function createMint(connection, payer) {
    const token = await spl_token_1.Token.createMint(connection, payer, payer.publicKey, null, 9, spl_token_1.TOKEN_PROGRAM_ID);
    return token.publicKey;
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
