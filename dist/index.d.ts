/// <reference types="node" />
/// <reference types="node" />
import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { Buffer } from 'buffer';
export declare enum TokenType {
    SOL = 0,
    USDC = 1
}
export declare class BulkerDexClient {
    private connection;
    private wallet;
    private provider;
    private program;
    private programId;
    constructor(connection: Connection, wallet: anchor.Wallet, programId: PublicKey, idl: any);
    /**
     * Initialize a new pool
     */
    initializePool(initialSol: number, initialUsdc: number, concentrationFactor: number, magicBlockAuth: PublicKey): Promise<PublicKey>;
    /**
     * Perform a swap via Magic Block delegation
     */
    swap(amountIn: number, minAmountOut: number, inputToken: TokenType, userSol: PublicKey, userUsdc: PublicKey, poolSol: PublicKey, poolUsdc: PublicKey, oraclePubkey: PublicKey): Promise<string>;
    /**
     * Process a delegated swap (called by Magic Block)
     */
    processDelegatedSwap(data: Buffer, magicBlockAuthority: PublicKey, userPubkey: PublicKey, userSol: PublicKey, userUsdc: PublicKey, poolSol: PublicKey, poolUsdc: PublicKey, oraclePubkey: PublicKey): Promise<string>;
    /**
     * Get pool information
     */
    getPoolInfo(authority: PublicKey): Promise<any>;
    /**
     * Find the pool PDA address
     */
    findPoolAddress(authority: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Find the pool authority PDA
     */
    findPoolAuthority(poolPda: PublicKey): Promise<[PublicKey, number]>;
    /**
     * Create token accounts for the pool
     */
    createTokenAccounts(poolPda: PublicKey, solMint: PublicKey, usdcMint: PublicKey): Promise<{
        poolSol: PublicKey;
        poolUsdc: PublicKey;
    }>;
}
