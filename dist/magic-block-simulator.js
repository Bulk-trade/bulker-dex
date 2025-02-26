"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const borsh = __importStar(require("borsh"));
// Load the IDL
const idlPath = path_1.default.resolve(__dirname, '../../target/idl/bulker_dex.json');
const idl = JSON.parse(fs_1.default.readFileSync(idlPath, 'utf8'));
// Load the Magic Block keypair (this would be the Magic Block authority)
const magicBlockKeypairPath = path_1.default.resolve(__dirname, './magic-block-keypair.json');
const magicBlockSecretKey = Uint8Array.from(JSON.parse(fs_1.default.readFileSync(magicBlockKeypairPath, 'utf8')));
const magicBlockKeypair = web3_js_1.Keypair.fromSecretKey(magicBlockSecretKey);
// Set up the connection
const connection = new web3_js_1.Connection('https://api.devnet.solana.com', 'confirmed');
const wallet = new anchor_1.Wallet(magicBlockKeypair);
// Program ID - replace with your deployed program ID
const programId = new web3_js_1.PublicKey('BuLKerDex1111111111111111111111111111111111');
// Pyth oracle account for SOL/USD - replace with the actual oracle account
const oraclePubkey = new web3_js_1.PublicKey('7AxV2515SwLFVxWSpCngQ3TNqY17JERwcCfULc464u7D');
// Define the schema for serializing/deserializing the delegated swap data
class DelegatedSwap {
    constructor(props) {
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
    const client = new index_1.BulkerDexClient(connection, wallet, programId, idl);
    // User's public key (the user who initiated the swap)
    const userPubkey = new web3_js_1.PublicKey('USER_PUBLIC_KEY_HERE');
    // Token accounts
    const solMint = new web3_js_1.PublicKey('SOL_MINT_HERE');
    const usdcMint = new web3_js_1.PublicKey('USDC_MINT_HERE');
    const userSolAccount = await spl_token_1.Token.getAssociatedTokenAddress(solMint, userPubkey, false);
    const userUsdcAccount = await spl_token_1.Token.getAssociatedTokenAddress(usdcMint, userPubkey, false);
    // Find the pool PDA
    const [poolPda, _] = await client.findPoolAddress(userPubkey);
    // Get pool token accounts
    const { poolSol, poolUsdc } = await client.createTokenAccounts(poolPda, solMint, usdcMint);
    // Create the delegated swap data
    const delegatedSwap = new DelegatedSwap({
        inputToken: index_1.TokenType.SOL,
        amountIn: BigInt(50000000),
        minAmountOut: BigInt(4500000), // 4.5 USDC
    });
    // Serialize the data
    const buffer = Buffer.alloc(1000);
    const length = borsh.serialize(DelegatedSwapSchema, delegatedSwap, buffer);
    const data = buffer.slice(0, length);
    console.log('Processing delegated swap as Magic Block...');
    const txId = await client.processDelegatedSwap(data, magicBlockKeypair.publicKey, userPubkey, userSolAccount, userUsdcAccount, poolSol, poolUsdc, oraclePubkey);
    console.log('Delegated swap processed:', txId);
}
main().catch(err => {
    console.error(err);
    process.exit(1);
});
