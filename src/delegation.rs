use anchor_lang::prelude::*;
use ephemeral_rollups_sdk::anchor::delegate;
use ephemeral_rollups_sdk::cpi::DelegateAccounts;
use ephemeral_rollups_sdk::cpi::DelegateConfig;
use crate::{pool::TokenType, error::DexError};

// Magic Block program ID
pub const MAGIC_BLOCK_PROGRAM_ID: &str = "MBLKhRxBCK7vLxaTpPDbzZsLTJqBhgUJ8bM6jE7ACS9";

// Data structure for delegated transactions
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DelegatedSwap {
    pub input_token: TokenType,
    pub amount_in: u64,
    pub min_amount_out: u64,
}

// Function to validate magic block authority
pub fn validate_magic_block_authority(
    authority: &Pubkey, 
    expected_authority: &Pubkey
) -> Result<()> {
    let auth_bytes = authority.to_bytes();
    let expected_bytes = expected_authority.to_bytes();
    if auth_bytes != expected_bytes {
        msg!("Authority mismatch: {:?} != {:?}", authority, expected_authority);
        return Err(error!(DexError::InvalidMagicBlockAuthority));
    }
    Ok(())
}

// Function to decode delegated swap data from Magic Block
pub fn decode_delegated_swap(data: &[u8]) -> Result<DelegatedSwap> {
    DelegatedSwap::try_from_slice(data)
        .map_err(|_| error!(DexError::InvalidInstruction))
}

// Define an accounts struct for delegate operations
#[delegate]
#[derive(Accounts)]
pub struct DelegateSwap<'info> {
    pub payer: Signer<'info>,
    #[account(mut, del)]
    pub pool: Account<'info, crate::pool::Pool>,
} 