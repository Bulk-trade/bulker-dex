use borsh::{BorshDeserialize, BorshSerialize};
use crate::pool::TokenType;

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct SwapParams {
    pub input_token: TokenType,
    pub amount_in: u64,
    pub min_amount_out: u64,
    pub price_limit: f64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub enum BulkerInstruction {
    /// Initialize a new pool
    /// 0. `[writable]` Pool account
    /// 1. `[signer]` Authority
    /// 2. `[]` System program
    InitializePool {
        initial_sol: u64,
        initial_usdc: u64,
        concentration_factor: u8,
    },
    
    /// Swap tokens
    /// 0. `[writable]` Pool account
    /// 1. `[]` Oracle account
    /// 2. `[signer]` User authority
    /// 3. `[writable]` User SOL account
    /// 4. `[writable]` User USDC account
    Swap(SwapParams),
    
    /// Handle a delegated swap settlement (via Magic Block)
    /// 0. `[writable]` Pool account 
    /// 1. `[]` Oracle account
    /// 2. `[signer]` Magic Block authority
    /// 3. `[writable]` User SOL account
    /// 4. `[writable]` User USDC account
    DelegatedSwapSettlement(SwapParams),
} 