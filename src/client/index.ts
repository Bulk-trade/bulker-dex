import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import * as anchor from '@project-serum/anchor';
import { Program, AnchorProvider, web3, BN } from '@project-serum/anchor';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { Buffer } from 'buffer';

// Define the TokenType enum to match our Rust contract
export enum TokenType {
  SOL = 0,
  USDC = 1,
}

export class BulkerDexClient {
  private connection: Connection;
  private wallet: anchor.Wallet;
  private provider: AnchorProvider;
  private program: Program;
  private programId: PublicKey;

  constructor(
    connection: Connection,
    wallet: anchor.Wallet,
    programId: PublicKey,
    idl: any
  ) {
    this.connection = connection;
    this.wallet = wallet;
    this.programId = programId;
    
    // Create the provider
    this.provider = new AnchorProvider(
      connection,
      wallet,
      { commitment: 'confirmed' }
    );
    
    // Create the program
    this.program = new Program(idl, programId, this.provider);
  }

  /**
   * Initialize a new pool
   */
  async initializePool(
    initialSol: number,
    initialUsdc: number,
    concentrationFactor: number,
    magicBlockAuth: PublicKey
  ): Promise<PublicKey> {
    // Find the pool PDA
    const [poolPda, _] = await this.findPoolAddress(this.wallet.publicKey);
    
    // Convert to BN for the contract
    const initialSolBN = new BN(initialSol);
    const initialUsdcBN = new BN(initialUsdc);
    
    // Call the initialize_pool instruction
    await this.program.methods
      .initializePool(
        initialSolBN,
        initialUsdcBN,
        concentrationFactor
      )
      .accounts({
        pool: poolPda,
        authority: this.wallet.publicKey,
        magicBlockAuth: magicBlockAuth,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    
    return poolPda;
  }

  /**
   * Perform a swap via Magic Block delegation
   */
  async swap(
    amountIn: number,
    minAmountOut: number,
    inputToken: TokenType,
    userSol: PublicKey,
    userUsdc: PublicKey,
    poolSol: PublicKey,
    poolUsdc: PublicKey,
    oraclePubkey: PublicKey
  ): Promise<string> {
    // Find the pool PDA
    const [poolPda, _] = await this.findPoolAddress(this.wallet.publicKey);
    const [authority, __] = await this.findPoolAuthority(poolPda);
    
    // Convert to BN for the contract
    const amountInBN = new BN(amountIn);
    const minAmountOutBN = new BN(minAmountOut);
    
    // Call the swap instruction
    const txId = await this.program.methods
      .swap(
        amountInBN,
        minAmountOutBN,
        inputToken
      )
      .accounts({
        pool: poolPda,
        oracle: oraclePubkey,
        user: this.wallet.publicKey,
        authority: authority,
        userSol: userSol,
        userUsdc: userUsdc,
        poolSol: poolSol,
        poolUsdc: poolUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    return txId;
  }

  /**
   * Process a delegated swap (called by Magic Block)
   */
  async processDelegatedSwap(
    data: Buffer,
    magicBlockAuthority: PublicKey,
    userPubkey: PublicKey,
    userSol: PublicKey,
    userUsdc: PublicKey,
    poolSol: PublicKey,
    poolUsdc: PublicKey,
    oraclePubkey: PublicKey
  ): Promise<string> {
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
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    
    return txId;
  }

  /**
   * Get pool information
   */
  async getPoolInfo(authority: PublicKey): Promise<any> {
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
    } catch (e) {
      console.error('Error fetching pool info:', e);
      throw e;
    }
  }

  /**
   * Find the pool PDA address
   */
  async findPoolAddress(authority: PublicKey): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [Buffer.from('pool'), authority.toBuffer()],
      this.programId
    );
  }

  /**
   * Find the pool authority PDA
   */
  async findPoolAuthority(poolPda: PublicKey): Promise<[PublicKey, number]> {
    return await PublicKey.findProgramAddress(
      [poolPda.toBuffer()],
      this.programId
    );
  }

  /**
   * Create token accounts for the pool
   */
  async createTokenAccounts(
    poolPda: PublicKey,
    solMint: PublicKey,
    usdcMint: PublicKey
  ): Promise<{ poolSol: PublicKey; poolUsdc: PublicKey }> {
    const [authority, _] = await this.findPoolAuthority(poolPda);
    
    // Create SOL token account for the pool
    const poolSolAccount = await getAssociatedTokenAddress(
      solMint,
      authority,
      true // allowOwnerOffCurve
    );
    
    // Create USDC token account for the pool
    const poolUsdcAccount = await getAssociatedTokenAddress(
      usdcMint,
      authority,
      true // allowOwnerOffCurve
    );
    
    return {
      poolSol: poolSolAccount,
      poolUsdc: poolUsdcAccount,
    };
  }
} 