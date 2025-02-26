"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BulkerDexClient = exports.TokenType = void 0;
const web3_js_1 = require("@solana/web3.js");
const anchor_1 = require("@project-serum/anchor");
const spl_token_1 = require("@solana/spl-token");
const buffer_1 = require("buffer");
// Define the TokenType enum to match our Rust contract
var TokenType;
(function (TokenType) {
    TokenType[TokenType["SOL"] = 0] = "SOL";
    TokenType[TokenType["USDC"] = 1] = "USDC";
})(TokenType = exports.TokenType || (exports.TokenType = {}));
class BulkerDexClient {
    constructor(connection, wallet, programId, idl) {
        this.connection = connection;
        this.wallet = wallet;
        this.programId = programId;
        // Create the provider
        this.provider = new anchor_1.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
        // Create the program
        this.program = new anchor_1.Program(idl, programId, this.provider);
    }
    /**
     * Initialize a new pool
     */
    async initializePool(initialSol, initialUsdc, concentrationFactor, magicBlockAuth) {
        // Find the pool PDA
        const [poolPda, _] = await this.findPoolAddress(this.wallet.publicKey);
        // Convert to BN for the contract
        const initialSolBN = new anchor_1.BN(initialSol);
        const initialUsdcBN = new anchor_1.BN(initialUsdc);
        // Call the initialize_pool instruction
        await this.program.methods
            .initializePool(initialSolBN, initialUsdcBN, concentrationFactor)
            .accounts({
            pool: poolPda,
            authority: this.wallet.publicKey,
            magicBlockAuth: magicBlockAuth,
            systemProgram: web3_js_1.SystemProgram.programId,
        })
            .rpc();
        return poolPda;
    }
    /**
     * Perform a swap via Magic Block delegation
     */
    async swap(amountIn, minAmountOut, inputToken, userSol, userUsdc, poolSol, poolUsdc, oraclePubkey) {
        // Find the pool PDA
        const [poolPda, _] = await this.findPoolAddress(this.wallet.publicKey);
        const [authority, __] = await this.findPoolAuthority(poolPda);
        // Convert to BN for the contract
        const amountInBN = new anchor_1.BN(amountIn);
        const minAmountOutBN = new anchor_1.BN(minAmountOut);
        // Call the swap instruction
        const txId = await this.program.methods
            .swap(amountInBN, minAmountOutBN, inputToken)
            .accounts({
            pool: poolPda,
            oracle: oraclePubkey,
            user: this.wallet.publicKey,
            authority: authority,
            userSol: userSol,
            userUsdc: userUsdc,
            poolSol: poolSol,
            poolUsdc: poolUsdc,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .rpc();
        return txId;
    }
    /**
     * Process a delegated swap (called by Magic Block)
     */
    async processDelegatedSwap(data, magicBlockAuthority, userPubkey, userSol, userUsdc, poolSol, poolUsdc, oraclePubkey) {
        // Find the pool PDA
        const [poolPda, _] = await this.findPoolAddress(userPubkey);
        const [authority, __] = await this.findPoolAuthority(poolPda);
        // Call the process_delegated_swap instruction
        const txId = await this.program.methods
            .processDelegatedSwap(data)
            .accounts({
            pool: poolPda,
            oracle: oraclePubkey,
            magicBlockAuthority: magicBlockAuthority,
            user: userPubkey,
            authority: authority,
            userSol: userSol,
            userUsdc: userUsdc,
            poolSol: poolSol,
            poolUsdc: poolUsdc,
            tokenProgram: spl_token_1.TOKEN_PROGRAM_ID,
        })
            .rpc();
        return txId;
    }
    /**
     * Get pool information
     */
    async getPoolInfo(authority) {
        const [poolPda, _] = await this.findPoolAddress(authority);
        try {
            const poolAccount = await this.program.account.pool.fetch(poolPda);
            return {
                solReserve: poolAccount.solReserve.toNumber(),
                usdcReserve: poolAccount.usdcReserve.toNumber(),
                oraclePrice: poolAccount.oraclePrice,
                concentrationFactor: poolAccount.concentrationFactor,
                bump: poolAccount.bump,
                magicBlockDelegate: poolAccount.magicBlockDelegate.toString(),
            };
        }
        catch (e) {
            console.error('Error fetching pool info:', e);
            throw e;
        }
    }
    /**
     * Find the pool PDA address
     */
    async findPoolAddress(authority) {
        return await web3_js_1.PublicKey.findProgramAddress([buffer_1.Buffer.from('pool'), authority.toBuffer()], this.programId);
    }
    /**
     * Find the pool authority PDA
     */
    async findPoolAuthority(poolPda) {
        return await web3_js_1.PublicKey.findProgramAddress([poolPda.toBuffer()], this.programId);
    }
    /**
     * Create token accounts for the pool
     */
    async createTokenAccounts(poolPda, solMint, usdcMint) {
        const [authority, _] = await this.findPoolAuthority(poolPda);
        // Create SOL token account for the pool
        const poolSolAccount = await spl_token_1.Token.getAssociatedTokenAddress(solMint, authority, true);
        // Create USDC token account for the pool
        const poolUsdcAccount = await spl_token_1.Token.getAssociatedTokenAddress(usdcMint, authority, true);
        return {
            poolSol: poolSolAccount,
            poolUsdc: poolUsdcAccount,
        };
    }
}
exports.BulkerDexClient = BulkerDexClient;
